"use strict";

var cluster = require('cluster');

if(cluster.isMaster) {
  var amqp = require('amqplib'),
      amqpConn = null,
      channel = null,
      numWorkers = require('os').cpus().length;

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
    createChannel();
  }

  function createChannel(){
    amqpConn.createChannel()
      .then(function(ch){
        channel = ch;

        ch.prefetch(1)
          .then(function(){
            return ch.assertQueue('task', {durable: true});
          }).then(function(qok){
            startTaskConsume();
          });

        ch.on("error", function(err) {
          console.error("[AMQP] channel error", err.message);
        });

        ch.on("close", function() {
          console.log("[AMQP] channel closed");
        });

      }).catch(function(err){
        console.error("[AMQP] error", err);
        amqpConn.close();
      });
  }

  function startTaskConsume(){
    console.log('Consume master has been started');
    channel.consume('task', handleFunction, {noAck: false});
  }

  function handleFunction(msg) {
    let data = JSON.parse(msg.content);
    if(data.task == 'changeNumberWorkers'){
      let number = Number(data.numberWorkers) || -1;
      let keyWorkers = Object.keys(cluster.workers);

      if(number < keyWorkers.length){
        // kill process
        let count = keyWorkers.length - number;
        for(let i=0;i<count;i++){
          cluster.workers[keyWorkers[i]].kill();
        }
        
      }else if(number > keyWorkers.length){
        // fork process
        let count = number - keyWorkers.length;
        for(let i=0;i<count;i++){
          cluster.fork();
        }
      }
    }
    channel.ack(msg); // Tell rabbitmq to remove msg from queue, serious!!!
  }

  connectToRabbitMQ();


  console.log('Master cluster setting up ' + numWorkers + ' workers...');

  for(let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', function(worker, code, signal) {
    console.log('Worker ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);
  });

}else{
  var amqp = require('amqplib'),
      MongoClient = require('mongodb').MongoClient,
      amqpConn = null,
      channel = null,
      db = null,
      count = 0,
      moment = require('moment'),
      url = 'mongodb://localhost:27017/test';

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
    createChannel();
  }

  function createChannel(){
    amqpConn.createChannel()
      .then(function(ch){
        channel = ch;
        ch.assertExchange('topic_logs', 'topic', {durable: true})
          .then(function(){
            return ch.assertQueue('saveLog', {durable: true});
          }).then(function(qok){
            return ch.bindQueue('saveLog', 'topic_logs', '#');
          }).then(function(){
            return ch.prefetch(1);
          }).then(function(){
            readyToStartWorker();
          });
        
        ch.on("error", function(err) {
          console.error("[AMQP] channel error", err.message);
        });

        ch.on("close", function() {
          console.log("[AMQP] channel closed");
          ch.connection.close();
          return setTimeout(connectToRabbitMQ, 1000);
        });

      }).catch(function(err){
        console.error("[AMQP] error", err);
        amqpConn.close();
      });
  }

  function startWorkerConsume(){
    console.log('Worker consume has been started!');
    channel.consume('saveLog', handleFunction, {noAck: false});
  }

  function handleFunction(msg) {
    var data = JSON.parse(msg.content);
    var collection = data._token || '';
    if(collection !== ''){
      delete data._token;
      if(data.time != undefined){
        data.expireTime = moment(data.time).toDate();
      }else{
        data.expireTime = moment().toDate();
      }
      db.collection(collection).insertOne(data)
        .then(function(results){
          channel.ack(msg); // Tell rabbitmq to remove msg from queue, serious!!!
        }).catch(function(err){
          channel.nack(msg); // Tell rabbitmq to requeue msg to queue
        });
    }else{
      channel.ack(msg); // Tell rabbitmq to remove msg from queue, serious!!!
    }
  }

  function connectToMongoDB(){
    MongoClient.connect(url)
      .then(function(database){
        console.log('[MongoDB] connected');
        db = database;

        readyToStartWorker();

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

  function readyToStartWorker(){
    count++;
    if(count == 2){
      startWorkerConsume();
      count--;
    }
  }

  connectToRabbitMQ();
  connectToMongoDB();

  process.on('uncaughtException', function (err) {
    console.error((new Date).toUTCString() + ' uncaughtException:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
}