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
      async = require('async'),
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
  // MongoClient.connect(url, function(err, database) {
  //   if(err) throw err;

  //   db = database;

  //   db.collection('apps').find({}, {'_id': 1}).toArray()
  //     .then(function(results){
  //       results.forEach((item)=>{
  //         appList.push(item._id.toString());
  //       });

  //     }).catch(function(e){
  //       throw e;
  //     });

  //   app.listen(8000);
  //   console.log('Process ' + process.pid + ' is listening to all incoming requests');
  // });

  // Connect to mongodb
  connectToMongo(url, 1);

  // Route for save log 
  app.get('/saveLog', function(req, res){

    if(appList.indexOf(req.query._token) != -1){ // Check whether _token is valid or not
      res.json({
        success: true
      });
      
      
      // console.time('taskA');
      // async.setImmediate(function () {
      //   sendLogToQueue(req.query, 0);
      // });
      sendLogToQueue(req.query, 0); // Send log to redis database
      // console.timeEnd('taskA');
    }else{
      res.json({
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

  // Route for create am index to a collection in mongodb
  app.get('/createIndex', function(req, res){
    if(appList.indexOf(req.query._token) != -1){ // Check whether _token is valid or not
      var collection = req.query._token;
      delete req.query._token;
      req.query.time = 1;
      db.collection(collection).createIndex(req.query, {background: true})
        .then(function(indexName){
          res.json({success: true});
        }).catch(function(err){
          console.log(err);
          res.json({success: false, message: 'Something went wrong'});
        });
    }else{
      res.send({
        success: false,
        message: "Doesn't exist an app with _token: "+ req.query._token
      });
    }
  });

  // Route for delete an index in a collection in mongodb
  app.get('/deleteIndex', function(req, res){
    if(appList.indexOf(req.query._token) != -1){ // Check whether _token is valid or not
      db.collection(req.query._token).dropIndex(req.query.indexName)
        .then(function(results){
          res.json({success: true});
        }).catch(function(err){
          res.json({success: false});
          console.log(err);
        });
    }else{
      res.json({
        success: false,
        message: "Doesn't exist an app with _token: "+ req.query._token
      });
    }
  });

  // Get all indexes in a collection
  app.get('/getListIndexes', function(req, res){
    if(appList.indexOf(req.query._token) != -1){ // Check whether _token is valid or not
      db.collection(req.query._token).listIndexes().toArray()
        .then(function(listIndexes){
          res.json({success: true, listIndexes});
        }).catch(function(err){
          res.json({success: false, message: 'System error'});
          console.log(err);
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

  // Search log 
  app.get('/search', function(req, res){
    if(appList.indexOf(req.query._token) != -1){ // Check whether _token is valid or not
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
    
      db.collection(collection).find(req.query, {_id: 0, expireTime: 0}).skip(skip).limit(limit).toArray()
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

app.get('/changeConcurency', function(req, res){
  queue.create('changeConcurency', req.query).removeOnComplete(true).save(function(err){
    if(err){
      res.json({success: false});
    }else{
      res.json({success: true});
    }
  });
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

  function connectToMongo(url, times){
    MongoClient.connect(url)
      .then(function(database){
        console.log('Connect to mongodb success');
        db = database;

        // Listen for some events
        db.on('reconnect', function(data){
          console.log('Reconnect success');
        });
        db.on('error', function(err){
          console.log(err);
        });
        db.on('close', function(err){
          console.log('Disconnect from mongodb');
        });

        return db.collection('apps').find({}, {'_id': 1}).toArray();
      }).then(function(results){
        results.forEach((item)=>{
          appList.push(item._id.toString());
        });

        app.listen(8000);
        console.log('Process ' + process.pid + ' is listening to all incoming requests');
      }).catch(function(err){
        if(times == 1){
          console.log(err);
          console.log('Trying to connect to mongodb...');
          times++;
        }
        if(db != undefined){
          db.close();
          db = undefined;
        }    
        setTimeout(function(){
          connectToMongo(url, times);
        }, 3000);
      });
  }
}
