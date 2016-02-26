"use strict";

var cluster = require('cluster');

if(cluster.isMaster) {
  var CleanUp = require('./lib/cleanup.js');
  var numWebservers = require('os').cpus().length;

  console.log('Master cluster setting up ' + numWebservers + ' webservers...');

  for(let i = 0; i < numWebservers; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', function(worker, code, signal) {
    console.log('Webserver ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);
    if(code != 93){
      console.log('Starting a new webserver');
      cluster.fork();
    }
  });

  function gracefulShutdown(){
    setTimeout(function(){
      process.exit(1);
    }, 5000);
  }

  CleanUp(gracefulShutdown);

} else {
  var RabbitMQ = require('./lib/rabbitmq.js'),
      rabbitMQ = new RabbitMQ({url: 'amqp://localhost'}),
      MongoDB = require('./lib/mongodb.js'),
      mongoDB = new MongoDB({url: 'mongodb://localhost:1234/test'}),
      routes = require('./lib/routes.js'),
      express = require('express'),
      app = express(),
      exchange = 'topic_logs',
      async = require('async'),
      CleanUp = require('./lib/cleanup.js'),
      amqpConn = null,
      channel = null,
      count = 0,
      db = null,
      server = null,
      offlineQueue = [];

  rabbitMQ.init();

  rabbitMQ.on('connect', function(conn){
    amqpConn = conn;
    rabbitMQ.createConfirmChannel();
  });
      
  rabbitMQ.on('created', function(ch){
    channel = ch;

    channel.assertExchange(exchange, 'topic', {durable: true});
      app.emit('ready');

      channel.on("error", function(err) {
        console.error("[AMQP] channel error", err.message);
      });

      channel.on("close", function() {
        console.log("[AMQP] channel closed");
      });

      while (true) {
        var m = offlineQueue.shift();
        if (!m) break;
        if(m[0] == 'log'){
          sendLogToQueue(m[1]);
        }else if(m[0] == 'task'){
          sendTaskToQueue(m[1]);
        }
      }
  });

  mongoDB.init();
  mongoDB.on('ready', function(){
    db = MongoDB.db;

    app.emit('ready');
  });

  app.on('ready', readyToStartWebServer);
  app.on('error', function(err){
    console.log(err.message);
  });

  function readyToStartWebServer(){
    count++;
    if(count == 2){
      app.removeListener('ready', readyToStartWebServer);
      startWebServer();
      count = null;
      readyToStartWebServer = null;
    }
  }

  function startWebServer(){
    routes(app, channel, db, offlineQueue);

    server = app.listen(8000, function () {
      console.log('Web server has been starting!');
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
  CleanUp(gracefulShutdown);
}
