"use strict";

var cluster = require('cluster');

if(cluster.isMaster) {
  var config = require('config'),
      cleanUp = require('./lib/cleanup.js'),
      RabbitMQ = require('./lib/rabbitmq.js'),
      amqpConn = null,
      channel = null,
      consumerTag = '';

  var numWorkers = config.get('rabbitMQ.numWorkers');

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
        return channel.assertQueue(config.get('rabbitMQ.taskQueue'),  {exclusive: true});
      }).then(function(qok){
        return channel.bindQueue(config.get('rabbitMQ.taskQueue'), config.get('rabbitMQ.exchange'), 'task');
      }).then(function(){
        return channel.prefetch(config.get('rabbitMQ.prefetch'));
      }).then(function(){
        startTaskConsume();
      }).catch(function(err){
        console.error('[RabbitMQ] bindQueue', err.message);
        channel.connection.close();
      });
  });

  function startTaskConsume(){
    console.log('Consume master has been started');
    channel.consume(config.get('rabbitMQ.taskQueue'), handleFunction, {noAck: false})
    	.then(function(results){
        consumerTag = results.consumerTag;
      }).catch(function(err){
        console.error('[Master] start consume', err.message);
        channel.connection.close();
      });
  }

  function handleFunction(msg) {
    try{
      let data = JSON.parse(msg.content);
      let number = parseInt(data.numWorkers) || -1;
      if(number > 0){
        let keyWorkers = Object.keys(cluster.workers);
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
    }catch(e){
      if(e instanceof SyntaxError){
        console.error('[Master] JSON parse', e.message);
      }else{
        console.error('[Master] handleFunction', e.message);
      }
      
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

  function gracefulShutdown(){
  	channel.cancel(consumerTag)
      .then(function(ok){
        setTimeout(function(){
	        process.exit(1);
        }, 7000);
      }).catch(function(err){
	    setTimeout(function(){
		    process.exit(1);        
	    }, 7000);
      });
  }

  cleanUp(gracefulShutdown);

}else{
  require('./client-worker.js');
}