var offlineQueue = null,
  	channel = null,
  	db = null,
  	exchange = 'topic_logs';

exports = module.exports = function(app, ch, database, queue){
	var	moment = require('moment'),
		bodyParser = require('body-parser'),
		mongodb = require('mongodb');

	offlineQueue = queue;
	channel = ch;
	db = database;

	  // parse application/x-www-form-urlencoded
    // app.use(bodyParser.urlencoded({ extended: false }));
    // parse application/json
    // app.use(bodyParser.json());
    app.use(bodyParser.raw({type: 'application/json'}));

    // Route for save log
    app.post('/saveLog', function(req, res){
      res.json({sucess: true});
      sendLogToQueue(req.body);
    });

    //Route for add one more app to system
    app.get('/addApp', function(req, res){
      if(typeof req.query.name == 'string'){
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
            console.error('[WebServer] search', e.message);
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
            console.error('[WebServer] changeExpireTime', err.message);
            res.json({success: false});
          });
      }else{
        res.json({success: false});
      }
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