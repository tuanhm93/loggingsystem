"use strict";

var cluster = require('cluster');

if(cluster.isMaster) {
  var cleanUp = require('./lib/cleanup.js'),
      config = require('config');

  var numWebservers = config.get('numWebservers');

  console.log('Master cluster setting up ' + numWebservers + ' webservers...');

  for(let i = 0; i < numWebservers; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', function(worker, code, signal) {
    console.log('Webserver ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);
    if(code != 93){
      console.log('Starting a new webserver');
      setTimeout(function(){
        cluster.fork();
      }, 3000);
    }
  });

  function gracefulShutdown(){
    setTimeout(function(){
      process.exit(1);
    }, 5000);
  }

  process.on('uncaughtException', function(err){
    console.log(err.message);
  });

  cleanUp(gracefulShutdown);
} else {
  var config = require('config'),
      RabbitMQ = require('./lib/rabbitmq'),
      mongodb = require('mongodb'),
      MongoDB = require('./lib/mongodb'),
      express = require('express'),
      bodyParser = require('body-parser'),
      cleanUp = require('./lib/cleanup.js'),
      moment = require('moment'),
      http = require('http'),
      amqpConn = null,
      channel = null,
      server = null,
      db = null,
      offlineQueue = [];

  var app = express();
  var exchange = config.get('rabbitMQ.exchange');

  var rabbitMQ = new RabbitMQ({
    host: config.get('rabbitMQ.host'),
    port: config.get('rabbitMQ.port'),
    username: config.get('rabbitMQ.username'),
    password: config.get('rabbitMQ.password'),
    vitualHost: config.get('rabbitMQ.vitualHost')
  });

  rabbitMQ.init();
  rabbitMQ.on('connect', function(conn){
    amqpConn = conn;
    rabbitMQ.createConfirmChannel();
  });
  
  rabbitMQ.on('created', function(ch){
    channel = ch;

    channel.assertExchange(config.get('rabbitMQ.exchange'), 'topic', {durable: true})
      .then(function(ok){
        readyToStartWebServer();

        while (true) {
          var m = offlineQueue.shift();
          if (!m) break;
          if(m[0] == 'log'){
            sendLogToQueue(m[1]);
          }
        }
      }).catch(function(err){
        console.error('[RabbitMQ] assertExchange', err.message);
        channel.connection.close();
      });

    channel.on("error", function(err) {
      console.error("[AMQP] channel error", err.message);
    });

    channel.on("close", function() {
      console.log("[AMQP] channel closed");
    });
  });

  var mongoDB = new MongoDB({
    host: config.get('mongoDB.host'),
    port: config.get('mongoDB.port'),
    username: config.get('mongoDB.username'),
    password: config.get('mongoDB.password'),
    database: config.get('mongoDB.database')
  });

  mongoDB.init();
  mongoDB.on('ready', function(database){
    db = database;

    readyToStartWebServer();
  });

  var count = 0;
  function readyToStartWebServer(){
    count++;
    if(count == 2){
      startWebServer();
    }
  }

  function startWebServer(){

    app.use('/CMS', express.static('CMS'));
    //parse application/x-www-form-urlencoded  
    app.use(bodyParser.urlencoded({ extended: false }));
    // parse application/json
    // app.use(bodyParser.json());

    // CORS
    app.use(function(req, res, next) {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "X-Requested-With");
      res.header("Access-Control-Allow-Headers", "Content-Type");
      next();
    });

    // Route for save log
    app.post('/saveLog', function(req, res){
      res.json({sucess: true});
      console.log(req.body);
      sendLogToQueue(req.body);
    });

    //Route for add one more app to system
    app.post('/addApp', function(req, res){
      console.log(req.body);
      if(typeof req.body.name == 'string'){
        db.collection(config.get('mongoDB.collectionApps')).insertOne({
          "name": req.body.name,
          "expireTime" : 0,
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
      db.collection(config.get('mongoDB.collectionApps')).remove({_id: new mongodb.ObjectID(req.query._token)})
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
      db.collection(config.get('mongoDB.collectionApps')).find({}).toArray()
        .then(function(listApp){
          res.json({success: true, listApp});
        }).catch(function(e){
          console.error('[WebServer] getListApps', e.message);
          res.json({success: false});
        });
    });

    //Route for get list all apps avaible in system
    app.get('/getApp', function(req, res){
      db.collection(config.get('mongoDB.collectionApps')).find({_id: new mongodb.ObjectID(req.query._token)}).toArray()
        .then(function(app){
          res.json({success: true, app});
        }).catch(function(e){
          console.error('[WebServer] getApp', e.message);
          res.json({success: false});
        });
    });

    // Search log 
    app.get('/search', function(req, res){
      var collection = req.query._token;
      if(typeof collection == 'string'){
        var page = req.query.page || 1;
        var skip = (page - 1)*10;
        var limit = config.get('limitSearch');

        delete req.query._token;
        delete req.query.page;

        if(req.query.startTime != undefined && req.query.endTime != undefined){
          req.query.time = {'$gte': +moment(req.query.startTime, "DD-MM-YYYY"), '$lte': +moment(req.query.endTime, "DD-MM-YYYY")};
          console.log(req.query.startTime);
          console.log(req.query.time);
          delete req.query.startTime;
          delete req.query.endTime;
        }else if(req.query.startTime != undefined){
          req.query.time = {'$gte': +moment(req.query.startTime, "DD-MM-YYYY")};
          delete req.query.startTime;
        }else if(req.query.endTime != undefined){
          req.query.time = {'$lte': +moment(req.query.endTime, "DD-MM-YYYY")};
          delete req.query.endTime;
        }
      
        db.collection(collection).find(req.query, {_id: 0, expireTime: 0}).sort({time:1}).skip(skip).limit(limit).toArray()
          .then(function(logs){
            res.json({success: true, logs});
          }).catch(function(e){
            console.error('[WebServer] search', e.message);
            res.json({success: false});
          }); 
      }else{
        res.json({success: false});
      }
    }); 

    // Change number workers
    app.get('/changeNumberWorkers', function(req, res){
      var numberWorkers = parseInt(req.query.numberWorkers) || -1;
      if(numberWorkers > 0){
        req.query.task = 'changeNumberWorkers';
        try{
          channel.sendToQueue(config.get('rabbitMQ.taskQueue'), new Buffer(JSON.stringify(req.query)),{ persistent: true }, function(err, ok){
            if (err) {
              console.error("[AMQP] sendToQueue", err);
              res.json({success: false});
              channel.connection.close();
            }else{
              res.json({success: true});
            }
          });
        }catch(e){
          console.error("[AMQP] sendToQueue", e.message);
          res.json({success: false});
        }
      }else{
        res.json({success: false});
      }
    });

    // Change time to delete a log
    app.get('/changeExpireTime', function(req, res){
      var collection = req.query._token || '';
      var expireTime = parseInt(req.query.expireTime)||-1;
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
            console.error('[WebServer] changeExpireTime', err.message);
            res.json({success: false});
          });
      }else{
        res.json({success: false});
      }
    });
    
    app.get('/numberApps', function(req, res){
      db.collection(config.get('mongoDB.collectionApps')).count({})
        .then(function(count){
          res.json({success: true, apps: count});
        }).catch(function(e){
          console.error('[WebServer] getListApps', e.message);
          res.json({success: false});
        });
    });

    app.get('/workerInf', function(req, res){
      var url = "http://"+config.get('rabbitMQ.username')+":"+config.get("rabbitMQ.password")+"@"
                + config.get('rabbitMQ.host')+":"+config.get('rabbitMQ.portAPI');
      var request = http.get(url+'/api/queues', function(response){
        var body = [];
        response.on('data', function(chunk){
          body.push(chunk);
        }).on('end', function(){
          body = JSON.parse(Buffer.concat(body));
          for(var i=0;i<body.length;i++){
            if(body[i].name == config.get('rabbitMQ.logQueue')){
              res.json({success: true, workers: body[i].consumers, logs: body[i].messages});
              break;
            }
          }
          if(i == body.length){
            res.json({success: false});
          }
        }).on('error', function(e){
          console.error('[Webserver] workerInf', e.message);
          res.json({success: false});
        });
      });

      request.on('error', function(e){
        res.json({success: false});
      });
    });

    server = app.listen(config.get('port'), function () {
      console.log('Web server has been starting!');
    });
  }

  function sendLogToQueue(content){
    try {    
      channel.publish(exchange, content._token || '', new Buffer(JSON.stringify(content)), { persistent: true },
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

  process.on('uncaughtException', function(err){
    console.log(err.message);
  });

  cleanUp(gracefulShutdown);
}

