#!/usr/bin/env node

var amqp = require('amqplib');

amqp.connect('amqp://localhost').then(function(conn) {
  process.once('SIGINT', function() { conn.close(); });
  return conn.createChannel().then(function(ch) {
    var ex = 'topic_logs';
    var ok = ch.assertExchange(ex, 'topic', {durable: true});
    
    ok = ok.then(function() {
      return ch.assertQueue('', {exclusive: true});
    });
    
    ok = ok.then(function(qok) {
      var queue = qok.queue;
      ch.bindQueue(queue, ex, '56aace3544aec0da799cfb17');
      return queue;
    });
    
    ok = ok.then(function(queue) {
      return ch.consume(queue, logMessage, {noAck: true});
    });

    return ok.then(function() {
      console.log(' [*] Waiting for logs. To exit press CTRL+C.');
    });
    
    function logMessage(msg) {
      console.log('This is a log for me!!!!');
    }
  });
}).then(null, console.warn);