var config = require('config'),
    zlib = require('zlib'),
    async = require('async'),
    bluebird = require('bluebird'),
    mongodb = require('mongodb');
    MongoDB = require('./lib/mongodb.js'),
	  RabbitMQ = require('./lib/rabbitmq.js'),
	  cleanUp = require('./lib/cleanup.js'),
    moment = require('moment'),
    amqpConn = null,
    channel = null,
    db = null,
    consumerTag = '';

gzipAsync = bluebird.promisify(zlib.gzip);
    
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
  rabbitMQ.createChannel();
});

rabbitMQ.on('created', function(ch){
	channel = ch;
  channel.assertExchange(config.get('rabbitMQ.exchange'), 'topic', {durable: true})
    .then(function(){
      return channel.assertQueue(config.get('rabbitMQ.logQueue'), {durable: true});
    }).then(function(qok){
      return channel.bindQueue(config.get('rabbitMQ.logQueue'), config.get('rabbitMQ.exchange'), 'log.#');
    }).then(function(){
      return channel.prefetch(config.get('rabbitMQ.prefetch'));
    }).then(function(){
      readyToStartWorker();
    }).catch(function(err){
      console.error('[RabbitMQ] bindQueue', err.message);
      channel.connection.close();
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

	readyToStartWorker();
});

function startWorkerConsume(){
  console.log('Worker consume has been started!');
  channel.consume(config.get('rabbitMQ.logQueue'), handleFunction, {noAck: false})
    .then(function(results){
      consumerTag = results.consumerTag;
    }).catch(function(err){
      console.error('[Worker] start worker', err.message);
      channel.connection.close();
    });
}

var count = 0;
function readyToStartWorker(){
  count++;
  if(count == 2){
    startWorkerConsume();
    count--;
  }
}

function handleFunction(msg) {
  try{
    var data = JSON.parse(msg.content);
    var collection = data._token || '';
    if(collection !== ''){

      // add expireTime to use ttl index
      data.expireTime = moment().toDate();
      async.series([
        function (callback){
          if(typeof data.contents === "string"){
            gzipAsync(data.contents)
              .then(function(r){
                data.contents = new mongodb.Binary(r);
                callback(null);
              }).catch(function(e){
                callback(e);
              });
          }else{
            callback(null);
          }
        }, function(callback){
          db.collection(collection).insertOne(data)
            .then(function(r){
              callback(null);
            }).catch(function(e){
              console.error('[Worker] DB error', err.message);
              callback(e);
            });
        }],function(e){
          if(e){
            channel.nack(msg);
          }else{  
            channel.ack(msg);
          }
      });

    }else{
      channel.ack(msg); // Tell rabbitmq to remove msg from queue, serious!!!
    }
  }catch(e){
    if(e instanceof SyntaxError){
      console.error('[Worker] JSON parse', e.message);
      channel.ack(msg);
    }else{
      console.error('[Worker] MongoDB', e.message);
      channel.nack(msg);
    }
  }
}


function gracefulShutdown(){
  channel.cancel(consumerTag)
    .then(function(ok){
      setTimeout(function(){
        if(cluster.worker.suicide){
          process.exit(1);
        }else{
          process.exit(93);
        }
      }, 5000);
    }).catch(function(err){

	    if(cluster.worker.suicide){
	       process.exit(1);        
	    }else{
	       process.exit(93);
	    }

    });
}

process.on('SIGINT', function(){
	cluster.worker.suicide = true;
});

cleanUp(gracefulShutdown);