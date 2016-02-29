"use strict";

var cluster = require('cluster');

if(cluster.isMaster) {
  var cleanUp = require('./lib/cleanup.js'),
      numWebservers = require('os').cpus().length;

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

  process.on('uncaughtException', function(err){
    console.log(err.message);
  });

  cleanUp(gracefulShutdown);
} else {
  var config = require('./config'),
      RabbitMQ = require('./lib/rabbitmq'),
      rabbitMQ = new RabbitMQ({url: config.urlRabbitMQ}),
      app = require('express')(),
      bodyParser = require('body-parser'),
      cleanUp = require('./lib/cleanup.js'),
      offlineQueue = [],
      hasStartWebServer = false;

  var amqpConn = null;
  rabbitMQ.init();
  rabbitMQ.on('connect', function(conn){
    amqpConn = conn;
    rabbitMQ.createConfirmChannel();
  });
  
  var channel = null;
  rabbitMQ.on('created', function(ch){
    channel = ch;

    channel.assertExchange(config.exchange, 'topic', {durable: true});

      if(!hasStartWebServer){
        hasStartWebServer = true;
        startWebServer();
      }

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

  var server = null;
  function startWebServer(){
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

    server = app.listen(config.portWebServer, function () {
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

  cleanUp(gracefulShutdown);
}

function sendLogToQueue(content){
  try {    
    channel.publish(config.exchange, JSON.parse(content.toString())._token || '', content, { persistent: true },
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