"use strict";

var cluster = require('cluster');

if(cluster.isMaster) {

  var numWebservers = require('os').cpus().length;

  console.log('Master cluster setting up ' + numWebservers + ' webservers...');

  for(let i = 0; i < numWebservers; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', function(worker, code, signal) {
    console.log('Webserver ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);
    console.log('Starting a new webserver');
    cluster.fork();
  });

} else {
  var amqp = require('amqplib'),
      express = require('express'),
      mongodb = require('mongodb'),
      MongoClient = mongodb.MongoClient,
      bodyParser = require('body-parser'),
      moment = require('moment'),
      async = require('async'),
      app = express(),
      exchange = 'topic_logs',
      amqpConn = null,
      channel = null,
      count = 0,
      db = null,
      url = 'mongodb://localhost:27017/test',
      offlineQueue = [];

  function readyToStartWebServer(){
    count++;
    if(count == 2){
      app.removeListener('ready', readyToStartWebServer);
      startWebServer();
      count = null;
      readyToStartWebServer = null;
    }
  }

  app.on('ready', readyToStartWebServer);

  function connectToMongoDB(){
    MongoClient.connect(url)
      .then(function(database){
        console.log('[MongoDB] connected');
        db = database;

        app.emit('ready');

        // Listen for some events
        db.on('reconnect', function(data){
          console.log(data);
          console.log('[MongoDB] reconnect success');
        });
        db.on('error', function(err){
          console.log('[MongoDB] error', err.message);
        });
        db.on('close', function(err){
          console.log('[MongoDB] disconnected');
        });
      }).catch(function(err){
        console.error("[MongoDB]", err.message);
        return setTimeout(connectToMongoDB, 1000);
      });
  }

  function connectToRabbitMQ(){
    amqp.connect('amqp://localhost')
      .then(function(conn) {
        amqpConn = conn;

        conn.on("error", function(err) {
          if (err.message !== "Connection closing") {
            console.error("[AMQP] conn error", err.message);
          }
        });

        conn.on("close", function() {
          console.error("[AMQP] reconnecting");
          return setTimeout(connectToRabbitMQ, 1000);
        });

        console.log("[AMQP] connected");

        whenConnected();

    }).catch(function(err){
      console.error("[AMQP]", err.message);
      return setTimeout(connectToRabbitMQ, 1000);
    });
  }
  
  function whenConnected(){
    createConfirmChannel();
  }

  function createConfirmChannel(){
    amqpConn.createConfirmChannel()
      .then(function(ch){
        channel = ch;
        ch.assertExchange(exchange, 'topic', {durable: true});

        app.emit('ready');

        ch.on("error", function(err) {
          console.error("[AMQP] channel error", err.message);
        });

        ch.on("close", function() {
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

      }).catch(function(err){
        console.error("[AMQP] error", err);
        amqpConn.close();
      });
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
      db.collection("apps").insertOne({
        "name": req.query.name,
        "created_date": moment().toDate()
      }).then(function(results){
        var _token = results.insertedId.toString();
        res.json({success: true, _token: _token});
        db.createCollection(_token);
      }).catch(function(e){
        res.json({success: false});
        console.log(e);
      });
    });

    //Route for delete an app in system
    app.get('/deleteApp', function(req, res){
      db.collection('apps').remove({_id: new mongodb.ObjectID(req.query._token)})
        .then(function(results){
          res.json({success: true});
          db.collection(req.query._token).drop();
        }).catch(function(e){
          console.log(e);
          res.json({success: false, message:'Something went wrong'})
        });
    });

    //Route for get list all apps avaible in system
    app.get('/getListApps', function(req, res){
      db.collection('apps').find().toArray()
        .then(function(listApp){
          res.json({success: true, listApp});
        }).catch(function(e){
          console.log(e);
          res.json({success: false});
        });
    });

    // Search log 
    app.get('/search', function(req, res){
      var collection = req.query._token;
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
      console.log(req.query);
    
      db.collection(collection).find(req.query, {_id: 0, expireTime: 0}).skip(skip).limit(limit).toArray()
        .then(function(logs){
          res.json({success: true, logs});
        }).catch(function(e){
          console.log(e);
          res.json({success: false});
        });
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
    

    app.listen(8000, function () {
      console.log('Web server has been starting!');
    });
  }


  connectToRabbitMQ();
  connectToMongoDB();

  process.on('uncaughtException', function (err) {
    console.error((new Date).toUTCString() + ' uncaughtException:', err.message);
    console.error(err.stack);
    process.exit(1);
  });

  function sendLogToQueue(content){
    try {    

      channel.publish(exchange, JSON.parse(content.toString())._token || '', content, { persistent: true },
        function(err, ok) { 
          if (err) {
            console.error("[AMQP] publish", err);
            offlineQueue.push(['log', content]);
            channel.connection.close();
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
}
