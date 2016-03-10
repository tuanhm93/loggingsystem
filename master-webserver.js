"use strict";

var cluster = require('cluster');

if(cluster.isMaster) {
  var cleanUp = require('./lib/cleanup.js'),
      config = require('config');

  var numWebservers = config.get('numWebservers');

  console.log('Master cluster setting up ' + numWebservers + ' webservers...');

  for(let i = 0; i < numWebservers; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', function(worker, code, signal) {
    console.log('Webserver ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);
    if(code != 93){
      console.log('Starting a new webserver');
      setTimeout(function(){
        cluster.fork();
      }, 3000);
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
  require('./client-webserver.js');
}

