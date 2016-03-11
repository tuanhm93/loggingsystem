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
      async = require('async'),
      zlib = require('zlib'),
      bluebird = require('bluebird'),
      amqpConn = null,
      channel = null,
      server = null,
      db = null,
      offlineQueue = [];

  var gunzipAsync = bluebird.promisify(zlib.gunzip);

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
          sendMsgToQueue(m[0], m[1], m[2]);
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
    app.use('/cms', express.static('CMS'));

    //--------------------------------------------------------------
    var router = express.Router();
    var parser = bodyParser.raw({type: 'application/json'});
    // Route for save log
    router.post('/save', parser, function(req, res){
      try{
        var data = JSON.parse(req.body);
        var key = 'log.' + data._token || '';
        res.json({sucess: true});
        sendMsgToQueue(exchange, key, req.body);
      }catch(e){
        console.error('[Webserver] save log', e.message);
        res.json({success: false});
      }
    });
    // --------------------------------------------------------------

    router.use(bodyParser.json());
    router.use(function(req, res, next) {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
      next();
    });

    //Route for add one more app to system
    router.post('/app', function(req, res){
      var data = req.body;
      var name = data.name || '';
      if(typeof name == 'string' && name != ''){
        db.collection(config.get('mongoDB.collectionApps')).insertOne({
            "name": name,
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
    router.delete('/app/:_token', function(req, res){
      var _token = req.params._token;
      db.collection(config.get('mongoDB.collectionApps')).remove({_id: new mongodb.ObjectID(_token)})
        .then(function(results){
          res.json({success: true});
          db.collection(_token).drop();
        }).catch(function(e){
          console.error('[WebServer] deleteApp', e.message);
          res.json({success: false})
        });
    });

    //Route for get list an app avaible in system
    router.get('/app/:_token', function(req, res){
      var _token = req.params._token;
      db.collection(config.get('mongoDB.collectionApps')).find({_id: new mongodb.ObjectID(_token)}).toArray()
        .then(function(app){
          var app = app[0];
          res.json({success: true, app});
        }).catch(function(e){
          console.error('[WebServer] getApp', e.message);
          res.json({success: false});
        });
    });

    //Route for get list all apps avaible in system
    router.get('/app', function(req, res){
      db.collection(config.get('mongoDB.collectionApps')).find({}).toArray()
        .then(function(listApp){
          res.json({success: true, listApp});
        }).catch(function(e){
          console.error('[WebServer] getListApps', e.message);
          res.json({success: false});
        });
    });

    // Change time to delete a log
    router.put('/app/:_token', function(req, res){
      var _token = req.params._token;
      var data = req.body;
      var time = parseInt(data.expireTime) || -1;
      if(time > 0){
        db.collection(_token).indexExists("expireTime_1")
          .then(function(result){
            if(result){
              return db.command({"collMod" : _token, "index": {"keyPattern": {"expireTime": 1}, expireAfterSeconds: time }});
            }else{
              return db.collection(_token).createIndex({"expireTime": 1}, {"expireAfterSeconds": time});
            }
          }).then(function(result){
            return db.collection(config.get('mongoDB.collectionApps')).updateOne({_id: new mongodb.ObjectID(_token)}, {$set: {expireTime: time}});
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

    function getQuerySearch(object){
      var keys = Object.keys(object);
      for(var i=0;i<keys.length;i++){
        var substr = keys[i].slice(0, 2);
        if(substr === "$s"){
          var field = keys[i].slice(3);
          if(object[field] == undefined){
            object[field] = {};
          }

          object[field]['$gte'] = object[keys[i]];
          delete object[keys[i]];
        }else if (substr === "$e"){
          var field = keys[i].slice(3);
          if(object[field] == undefined){
            object[field] = {};
          }

          object[field]['$lte'] = object[keys[i]];
          delete object[keys[i]];
        }
      }
      return object;
    }
    // Search log 
    router.post('/search', function(req, res){
      var data = req.body;
      var collection = data._token;
      delete data._token;
      if(typeof collection == 'string'){
        var sort = data.sort || {};
        var limit = data.limit || 10;
        var page = data.page || 1;
        delete data.sort;
        delete data.limit;
        delete data.page;

        var query = getQuerySearch(data);

        console.log(query);
        var cursor = db.collection(collection).find(query, {_id: 0, expireTime: 0}).sort(sort).skip((page-1)*limit).limit(limit);

        async.parallel([
          function(callback){
            cursor.count()
              .then(function(r){
                callback(null, r);
              }).catch(function(e){
                callback(e);
              });
          }, function(callback){
            cursor.toArray()
              .then(function(logs){
                async.each(logs, function(log, asyncCallback){
                  if(log.contents._bsontype === "Binary"){
                    gunzipAsync(log.contents.buffer)
                      .then(function(r){
                        log.contents = r.toString();
                        asyncCallback(null);
                      }).catch(function(e){
                        asyncCallback(e);
                      });
                  }else{
                    asyncCallback(null);
                  }
                }, function(e){
                  if(e){
                    callback(e);
                  }else{
                    callback(null, logs);
                  }
                });
              }).catch(function(e){
                callback(e);
              });
          }
        ],
        function(e, rs){
          if(e){
            res.json({success: false});
          }else{
            res.json({success: true, total: rs[0], logs: rs[1]})
          }
        });
      }else{
        res.json({success: false});
      }
    }); 

    // Change number workers
    router.post('/worker', function(req, res){
      var data = req.body;
      var num = parseInt(data.numWorkers) || -1;
      if(num > 0){
        sendMsgToQueue(exchange, 'task', new Buffer(JSON.stringify(data)));
        res.json({success: true});
      }else{
        res.json({success: false});
      }
    });

    // Get inf about worker
    router.get('/worker', function(req, res){
      var url = "http://"+config.get('rabbitMQ.username')+":"+config.get("rabbitMQ.password")+"@"
                + config.get('rabbitMQ.host')+":"+config.get('rabbitMQ.portAPI');

      var request = http.get(url+'/api/queues/%2f/'+config.get('rabbitMQ.logQueue'), function(response){
        var body = [];
        response.on('data', function(chunk){
          body.push(chunk);
        }).on('end', function(){
          body = JSON.parse(Buffer.concat(body));
          res.json({success: true, workers: body.consumers, logs: body.messages});
        }).on('error', function(e){
          console.error('[Webserver] workerInf', e.message);
          res.json({success: false});
        });
      });

      request.on('error', function(e){
        res.json({success: false});
      });
    });

    app.use('/api', router);

    server = app.listen(config.get('port'), function () {
      console.log('Web server has been starting!');
    });
  }

  function sendMsgToQueue(exchange, key, content){
    channel.publish(exchange, key, content, { persistent: true },
      function(err, ok) { 
        if (err) {
          console.error("[AMQP] publish", err);
          offlineQueue.push([exchange, key, content]);
          channel.connection.close();
        }
      });
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

