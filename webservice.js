"use strict";

var cluster = require('cluster');

if(cluster.isMaster) {

  var numWorkers = require('os').cpus().length;

  console.log('Master cluster setting up ' + numWorkers + ' workers...');

  function sendToAllWorkers(message){
    Object.keys(cluster.workers).forEach((id) => {
      cluster.workers[id].send(message);
    });
  }

  for(let i = 0; i < numWorkers; i++) {
    cluster.fork().on('message', function(message){
      sendToAllWorkers(message);
    });
  }
  
  cluster.on('exit', function(worker, code, signal) {
    console.log('Worker ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);
    console.log('Starting a new worker');
    cluster.fork().on('message', function(message){
      sendToAllWorkers(message);
    });
  });
} else {
  var app = require('express')(),
      // Queue = require('bull'),
      // logQueue = Queue('logqueue3', 6379, '127.0.0.1'),
      kue = require('kue'), 
      queue = kue.createQueue(),                                               
      // queue = kue.createQueue({
      //   redis: {
      //     options:{
      //       enable_offline_queue: false
      //     }
      //   }
      // }),
      promise = require('bluebird'),
      moment = require('moment'),
      mongodb = require('mongodb'),
      MongoClient = mongodb.MongoClient,
      url = 'mongodb://localhost:1234/test',
      appList = [],
      db,
      winston = require('winston'),
      logger = new (winston.Logger)({
        transports: [
          new (winston.transports.File)({ filename: 'loggingsystem.log' })
        ]
      });
  // Connect to mongodb
  MongoClient.connect(url, function(err, database) {
    if(err) throw err;

    db = database;

    db.collection('apps').find({}, {'_id': 1}).toArray()
      .then(function(results){
        results.forEach((item)=>{
          appList.push(item._id.toString());
        });
      }).catch(function(e){
        throw e;
      });

    app.listen(8000);
    console.log('Process ' + process.pid + ' is listening to all incoming requests');
  });

  // Route for save log 
  app.get('/saveLog', function(req, res){

    if(appList.indexOf(req.query._token) != -1){ // Check whether _token is valid or not
      res.send({
        success: true
      });
      
      sendLogToQueue(req.query, 0); // Send log to redis database

    }else{
      res.send({
        success: false,
        message: "Doesn't exist an app with _token: "+ req.query._token
      });
    }
  });

  //Route for add one more app to system
  app.get('/addApp', function(req, res){
    db.collection("apps").insertOne({
      "name": req.query.name,
      "created_date": moment().toDate()
    }).then(function(results){
      var _token = results.insertedId.toString();
      res.json({success: true, _token: _token});
      process.send({
        task: 'addApp',
        _token: _token
      });
      db.createCollection(_token);
    }).catch(function(e){
      res.json({success: false});
      console.log(e);
    });
  });
  //Route for delete an app in system
  app.get('/deleteApp', function(req, res){
    if(appList.indexOf(req.query._token) != -1){ 

      db.collection('apps').remove({_id: new mongodb.ObjectID(req.query._token)})
        .then(function(results){
          res.json({success: true});
          process.send({
            task: 'removeApp',
            _token: req.query._token
          });
          db.collection(req.query._token).drop();
        }).catch(function(e){
          console.log(e);
          res.json({success: false, message:'Something went wrong'})
        });

    }else{
      res.send({
        success: false,
        message: "Doesn't exist an app with _token: "+ req.query._token
      });
    }
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

  app.get('/createIndex', function(req, res){
    if(appList.indexOf(req.query._token) != -1){ // Check whether _token is valid or not
      var collection = req.query._token;
      delete req.query._token;
      db.collection(collection).ensureIndex(req.query, null, function(err, results) {
        if(err){
          console.log(err);
          res.json({success: false, message: 'Something went wrong'});
        }else{
          res.json({success: true});
        }
      });
    }else{
      res.send({
        success: false,
        message: "Doesn't exist an app with _token: "+ req.query._token
      });
    }
  });

  // app.get('/deleteIndex', function(req, res){
  //   if(appList.indexOf(req.query._token) != -1){ // Check whether _token is valid or not
  //     var collection = req.query._token;
  //     req.query._id = 1;
  //     delete req.query._token;
  //     db.collection(collection).dropIndex(req.query, null, function(err, results) {
  //       if(err){
  //         res.json({success: false, message: 'Something went wrong'});
  //       }else{
  //         res.json({success: true});
  //       }
  //     });
  //   }else{
  //     res.send({
  //       success: false,
  //       message: "Doesn't exist an app with _token: "+ req.query._token
  //     });
  //   }
  // });

  app.get('/getListIndexes', function(req, res){
    console.log('List index');
    if(appList.indexOf(req.query._token) != -1){ // Check whether _token is valid or not
      var cursor = db.collection(req.query._token).listIndexes();
      var listIndexes = [];
      cursor.each(function(err, doc) {
        if(err){
          console.log(err);
          res.json({success: false})
        }else{
          if(doc != null){
            listIndexes.push(doc);
          }else{
            res.json({success: true, listIndexes});
          }
        }
      });
    }else{
      res.send({
        success: false,
        message: "Doesn't exist an app with _token: "+ req.query._token
      });
    }
  });

  app.get('/changeExpireTime', function(req, res){
   
  });

  app.get('/search', function(req, res){
    if(appList.indexOf(req.query._token) != -1){ // Check whether _token is valid or not
      var collection = req.query._token;
      var page = req.query.page || 1;
      var skip = (page - 1)*10;
      var limit = 10;

      delete req.query._token;
      delete req.query.page;

      if(req.query.startTime != undefined && req.query.endTime != undefined){
        req.query.time = {'$gte': moment(req.query.startTime).toDate().getTime(), '$lte': moment(req.query.endTime).toDate().getTime() };
        delete req.query.startTime;
        delete req.query.endTime;
      }else if(req.query.startTime != undefined){
        req.query.time = {'$gte': moment(req.query.startTime).toDate().getTime()};
        delete req.query.startTime;
      }else if(req.query.endTime != undefined){
        req.query.time = {'$lte': moment(req.query.endTime).toDate().getTime()};
        delete req.query.endTime;
      }
    
      db.collection(collection).find(req.query).skip(skip).limit(limit).toArray()
        .then(function(logs){
          res.json({success: true, logs});
        }).catch(function(e){
          console.log(e);
          res.json({success: false})
        });
    }else{
      res.send({
        success: false,
        message: "Doesn't exist an app with _token: "+ req.query._token
      });
    }
  });

  process.on('message', function(message){
    console.log(message);
    if(message.task == 'addApp'){
      appList.push(message._token);
    }else if(message.task == 'removeApp'){
      var index = appList.indexOf(message._token);

      if(index != -1){
        appList.splice(index, 1);
      }
    }
  }); 

  queue.on( 'error', function( err ) {
    // console.log( 'Oops... ', err );
  });

  
  function sendLogToQueue(message, attempts){
    queue.create('saveLog', message).removeOnComplete(true).save(function(err){
      if(err){
        console.log(err);
        attempts++;
        if(attempts == 5){
          logger.log('error', message);
        }else{
          setTimeout(function(){
            sendLogToQueue(message, attempts);
          }, 60000);
        }
      }
    });
  }
}