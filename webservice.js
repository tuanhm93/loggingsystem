"use strict";

var cluster = require('cluster');

if(cluster.isMaster) {
  var CleanUp = require('./lib/cleanup.js');
  var numWebservers = require('os').cpus().length;

  console.log('Master cluster setting up ' + numWebservers + ' webservers...');

  for(let i = 0; i < numWebservers; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', function(worker, code, signal) {
    console.log('Webserver ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);
    if(code != 93){
      console.log('Starting a new webserver');
      cluster.fork();
    }
  });

  function gracefulShutdown(){
    setTimeout(function(){
      process.exit(1);
    }, 5000);
  }

  CleanUp(gracefulShutdown);

} else {
  var RabbitMQ = require('./lib/rabbitmq.js'),
      rabbitMQ = new RabbitMQ({url: 'amqp://localhost'}),
      mongodb = require('mongodb'),
      MongoDB = require('./lib/mongodb.js'),
      mongoDB = new MongoDB({url: 'mongodb://localhost:1234/test'}),
      api = require('./lib/api.js'),
      express = require('express'),
      app = express(),
      bodyParser = require('body-parser'),
      moment = require('moment'),
      async = require('async'),
      CleanUp = require('./lib/cleanup.js'),
      exchange = 'topic_logs',
      amqpConn = null,
      channel = null,
      count = 0,
      db = null,
      offlineQueue = [],
      server = null;

  rabbitMQ.init();

  rabbitMQ.on('connect', function(conn){
    amqpConn = conn;
    rabbitMQ.createConfirmChannel();
  });
      
  rabbitMQ.on('created', function(ch){
    channel = ch;

    channel.assertExchange(exchange, 'topic', {durable: true});
      app.emit('ready');

      channel.on("error", function(err) {
        console.error("[AMQP] channel error", err.message);
      });

      channel.on("close", function() {
        console.log("[AMQP] channel closed");
      });

      while (true) {
        var m = offlineQueue.shift();
        if (!m) break;
        if(m[0] == 'log'){
          sendLogToQueue(m[1]);
        }else if(m[0] == 'task'){
          sendTaskToQueue(m[1]);
        }
      }
  });

  mongoDB.init();
  mongoDB.on('ready', function(){
    db = MongoDB.db;

    app.emit('ready');
  });

  app.on('ready', readyToStartWebServer);

  function readyToStartWebServer(){
    count++;
    if(count == 2){
      app.removeListener('ready', readyToStartWebServer);
      startWebServer();
      count = null;
      readyToStartWebServer = null;
    }
  }

  function startWebServer(){

    // parse application/x-www-form-urlencoded
    // app.use(bodyParser.urlencoded({ extended: false }));
    // parse application/json
    // app.use(bodyParser.json());
    app.use(bodyParser.raw({type: 'application/json'}));
    
    app.post('/saveLog', function(req, res){
      res.json({sucess: true});
      sendLogToQueue(req.body);
    });

    //Route for add one more app to system
    app.get('/addApp', function(req, res){
      if(typeof req.query == 'string'){
        db.collection("apps").insertOne({
          "name": req.query.name,
          "created_date": moment().toDate()
        }).then(function(results){
          var _token = results.insertedId.toString();
          res.json({success: true, _token: _token});
          db.createCollection(_token);
        }).catch(function(e){
          res.json({success: false});
          console.error('[WebServer] addApp', e.message);
        });
      }else{
        res.json({success: false});
      }
    });

    //Route for delete an app in system
    app.get('/deleteApp', function(req, res){
      db.collection('apps').remove({_id: new mongodb.ObjectID(req.query._token)})
        .then(function(results){
          res.json({success: true});
          db.collection(req.query._token).drop();
        }).catch(function(e){
          console.error('[WebServer] deleteApp', e.message);
          res.json({success: false})
        });
    });

    //Route for get list all apps avaible in system
    app.get('/getListApps', function(req, res){
      db.collection('apps').find().toArray()
        .then(function(listApp){
          res.json({success: true, listApp});
        }).catch(function(e){
          console.error('[WebServer] getListApps', e.message);
          res.json({success: false});
        });
    });

    // Search log 
    app.get('/search', function(req, res){
      var collection = req.query._token;
      if(typeof collection == 'string'){
        var page = req.query.page || 1;
        var skip = (page - 1)*10;
        var limit = 10;

        delete req.query._token;
        delete req.query.page;

        if(req.query.startTime != undefined && req.query.endTime != undefined){
          req.query.time = {'$gte': +moment(req.query.startTime, "DD-MM-YYYY"), '$lte': +moment(req.query.endTime, "DD-MM-YYYY")};
          delete req.query.startTime;
          delete req.query.endTime;
        }else if(req.query.startTime != undefined){
          req.query.time = {'$gte': +moment(req.query.startTime, "DD-MM-YYYY")};
          delete req.query.startTime;
        }else if(req.query.endTime != undefined){
          req.query.time = {'$lte': +moment(req.query.endTime, "DD-MM-YYYY")};
          delete req.query.endTime;
        }
      
        db.collection(collection).find(req.query, {_id: 0, expireTime: 0}).skip(skip).limit(limit).toArray()
          .then(function(logs){
            res.json({success: true, logs});
          }).catch(function(e){
            console.log(e);
            res.json({success: false});
          }); 
      }else{
        res.json({success: false});
      }
    }); 
      

    // Change number workers
    app.get('/changeNumberWorkers', function(req, res){
      var numberWorkers = Number(req.query.numberWorkers) || -1;
      if(numberWorkers > 0){
        res.json({success: true});
        req.query.task = 'changeNumberWorkers';
        sendTaskToQueue(req.query);
      }else{
        res.json({success: false});
      }
    });
    
    app.get('/changeExpireTime', function(req, res){
      var collection = req.query._token || '';
      var expireTime = Number(req.query.expireTime)||-1;
      if((collection != '') && (expireTime != -1)){
        db.collection(collection).indexExists("expireTime_1")
          .then(function(result){
            if(result){
              return db.command({"collMod" : req.query._token, "index": {"keyPattern": {"expireTime": 1}, expireAfterSeconds: expireTime }});
            }else{
              return db.collection(collection).createIndex({"expireTime": 1}, {"expireAfterSeconds": expireTime});
            }
          }).then(function(result){
            return db.collection('apps').updateOne({_id: new mongodb.ObjectID(req.query._token)}, {$set: {expireTime: expireTime}});
          }).then(function(result){
            res.json({success: true});
          }).catch(function(err){
            res.json({success: false});
          });
      }else{
        res.json({success: false});
      }
    });
    

    server = app.listen(8000, function () {
      console.log('Web server has been starting!');
    });
  }

  function sendLogToQueue(content){
    try {    
      channel.publish(exchange, JSON.parse(content.toString())._token || '', content, { persistent: true },
        function(err, ok) { 
          if (err) {
            console.error("[AMQP] publish", err);
            offlineQueue.push(['log', content]);
            channel.connection.close();
          }else{
            console.log('haha');
          }
        });
    } catch (e) {                               
      if(e instanceof SyntaxError){
        console.log("[SyntaxError] parse json:", e.message);
      }else{
        console.error("[AMQP] publish", e.message);
        offlineQueue.push(['log', content]);
      }                                                                                       
    }
  }

  function sendTaskToQueue(content){
    try{
      channel.sendToQueue('task', new Buffer(JSON.stringify(content)),{ persistent: true }, function(err, ok){
        if (err) {
          console.error("[AMQP] sendToQueue", err);
          offlineQueue.push(['task', content]);
          channel.connection.close();
        }
      });
    }catch(e){
      console.error("[AMQP] sendToQueue", e.message);
      offlineQueue.push(['task', content]);
    }
  }

  function gracefulShutdown(){
    server.close(function () {
      setTimeout(function(){
        if(suicide){
          process.exit(93);
        }else{
          process.exit(1);
        }
      }, 3000);
    });
  }

  var suicide = false;
  process.on('SIGINT', function(){
    suicide = true;
  });

  process.on('SIGTERM', function(){
    suicide = true;
  });

  CleanUp(gracefulShutdown);
}
