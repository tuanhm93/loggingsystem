var config = require('./config'),
    RabbitMQ = require('./lib/rabbitmq'),
    rabbitMQ = new RabbitMQ({url: config.urlRabbitMQ}),
    MongoDB = require('./lib/mongodb.js'),
    mongoDB = new MongoDB({url: config.urlMongoDB}),
    mongodb = require('mongodb'),
    express = require('express'),
    app = express(),
    bodyParser = require('body-parser'),
    moment = require('moment'),
    http = require('http'),
    rabbitUrlAPI = config.apiRabbitMQ;

var amqpConn = null;
rabbitMQ.init();
rabbitMQ.on('connect', function(conn){
  amqpConn = conn;
  rabbitMQ.createConfirmChannel();
});
    
var channel = null;
rabbitMQ.on('created', function(ch){
  channel = ch;

  channel.assertQueue('task', {durable: true})
    .then(function(qok){
      readyToStartWebServer();
    }).catch(function(err){
      console.log('[AMQP] assertQueue', err.message);
      channel.connection.close();
    });

  channel.on("error", function(err) {
    console.error("[AMQP] channel error", err.message);
  });

  channel.on("close", function() {
    console.log("[AMQP] channel closed");
  });
});

var db = null;
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

var server = null;
function startWebServer(){
  app.use('/CMS', express.static('CMS'));
  // parse application/x-www-form-urlencoded  
  app.use(bodyParser.urlencoded({ extended: false }));
  // parse application/json
  app.use(bodyParser.json());

  app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
  });

  //Route for add one more app to system
  app.post('/addApp', function(req, res){
    if(typeof req.body.name == 'string'){
      db.collection("apps").insertOne({
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
    db.collection('apps').find({}).toArray()
      .then(function(listApp){
        res.json({success: true, listApp});
      }).catch(function(e){
        console.error('[WebServer] getListApps', e.message);
        res.json({success: false});
      });

  });

  //Route for get list all apps avaible in system
  app.get('/getApp', function(req, res){
    db.collection('apps').find({_id: new mongodb.ObjectID(req.query._token)}).toArray()
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
        channel.sendToQueue('task', new Buffer(JSON.stringify(req.query)),{ persistent: true }, function(err, ok){
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
    db.collection('apps').count({})
      .then(function(count){
        res.json({success: true, apps: count});
      }).catch(function(e){
        console.error('[WebServer] getListApps', e.message);
        res.json({success: false});
      });
  });

  app.get('/workerInf', function(req, res){
    var request = http.get(rabbitUrlAPI+'/api/queues', function(response){
      var body = [];
      response.on('data', function(chunk){
        body.push(chunk);
      }).on('end', function(){
        body = JSON.parse(Buffer.concat(body));
        for(var i=0;i<body.length;i++){
          if(body[i].name == 'saveLog'){
            res.json({success: true, workers: body[i].consumers, logs: body[i].messages});
            break;
          }
        }
        if(i == body.length){
          res.json({success: false});
        }
      }).on('error', function(){
        res.json({success: false});
      });
    });

    request.on('error', function(e){
      res.json({success: false});
    });
  });

  server = app.listen(config.portWebService, function () {
    console.log('Web service has been starting!');
  });
}
  
