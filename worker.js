"use strict";

var cluster = require('cluster');

if(cluster.isMaster) {
  var RabbitMQ = require('./lib/rabbitmq.js'),
      numWorkers = require('os').cpus().length,
      rabbitMQ = new RabbitMQ({url: 'amqp://localhost'}),
      CleanUp = require('./lib/cleanup.js'),
      count = 0,
      channel = null;

  rabbitMQ.init();

  rabbitMQ.on('ready', function(){
  	channel = RabbitMQ.channel;

  	channel.prefetch(1)
      .then(function(){
        return channel.assertQueue('task', {durable: true});
      }).then(function(qok){
        startTaskConsume();
      });
  });

  function startTaskConsume(){
    console.log('Consume master has been started');
    channel.consume('task', handleFunction, {noAck: false});
  }

  function handleFunction(msg) {
    try{
      let data = JSON.parse(msg.content);
      if(data.task == 'changeNumberWorkers'){
        let number = Number(data.numberWorkers) || -1;
        let keyWorkers = Object.keys(cluster.workers);
        if(number > 0){
          if(number < keyWorkers.length){
            // kill process
            let count = keyWorkers.length - number;
            for(let i=0;i<count;i++){
              cluster.workers[keyWorkers[i]].kill('SIGTERM');
            }
            
          }else if(number > keyWorkers.length){
            // fork process
            let count = number - keyWorkers.length;
            for(let i=0;i<count;i++){
              cluster.fork();
            }
          }  
        }
      }  
    }catch(e){
      console.error('[Master] JSON parse', e.message);
    }finally{
      channel.ack(msg); // Tell rabbitmq to remove msg from queue, serious!!!
    }
  }

  console.log('Master cluster setting up ' + numWorkers + ' workers...');

  for(let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on('exit', function(worker, code, signal) {
    console.log('Worker ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);
    if(code == 93){
      cluster.fork();
    }
  });

}else{
  var MongoDB = require('./lib/mongodb.js'),
  	  mongoDB = new MongoDB({url: 'mongodb://localhost:1234/test'}),
  	  RabbitMQ = require('./lib/rabbitmq.js'),
  	  rabbitMQ = new RabbitMQ({url: 'amqp://localhost'}),
  	  CleanUp = require('./lib/cleanup.js'),
      db = null,
      count = 0,
      moment = require('moment'),
      url = 'mongodb://localhost:1234/test',
      consumerTag = '';

  rabbitMQ.init();
  rabbitMQ.on('ready', function(){
  	channel = RabbitMQ.channel;

    channel.assertExchange('topic_logs', 'topic', {durable: true})
      .then(function(){
        return channel.assertQueue('saveLog', {durable: true});
      }).then(function(qok){
        return channel.bindQueue('saveLog', 'topic_logs', '#');
      }).then(function(){
        return channel.prefetch(1);
      }).then(function(){
        readyToStartWorker();
      });
  });

  mongoDB.init();
  mongoDB.on('ready', function(){
  	db = MongoDB.db;

  	readyToStartWorker();
  });

  function startWorkerConsume(){
    console.log('Worker consume has been started!');
    channel.consume('saveLog', handleFunction, {noAck: false})
      .then(function(results){
        consumerTag = results.consumerTag;
      }).catch(function(err){
        console.error('[Worker] start worker', err.message);
        channel.connection.close();
      });
  }

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
        delete data._token;
        let hasSet = false;

        if(data.time != undefined){
          let miliseconds = Number(data.time) || -1;
          if(miliseconds != -1){
            data.expireTime = moment(data.time).toDate(); 
            hasSet = true;
          }
        }

        if(!hasSet){
          data.expireTime = moment().toDate();
        }

        db.collection(collection).insertOne(data)
          .then(function(results){
            channel.ack(msg); // Tell rabbitmq to remove msg from queue, serious!!!
          }).catch(function(err){
            console.error('[Worker] DB error', err.message);
            channel.nack(msg); // Tell rabbitmq to requeue msg to queue
          });
      }else{
        channel.ack(msg); // Tell rabbitmq to remove msg from queue, serious!!!
      }
    }catch(e){
      if(e instanceof SyntaxError){
        console.error('[Worker] JSON parse', e.message);
      }else{
        console.error('[Worker] MongoDB', e.message);
      }
      channel.ack(msg);
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
        setTimeout(function(){
          if(cluster.worker.suicide){
            process.exit(1);        
          }else{
            process.exit(93);
          }
        }, 5000);
      });
  }

  CleanUp(gracefulShutdown);

}