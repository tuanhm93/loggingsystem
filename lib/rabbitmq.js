"use strict";

var EventEmitter = require('events').EventEmitter,
	amqp = require('amqplib');

exports = module.exports = RabbitMQ;

function RabbitMQ(options){
	this.options = options;
}

/**
 * Inherit from `EventEmitter.prototype`.
 */

RabbitMQ.prototype.__proto__ = EventEmitter.prototype;

RabbitMQ.prototype.init = function(){
	this.connectToRabbitMQ(this.options.url);
}


RabbitMQ.prototype.connectToRabbitMQ = function (url){
	var _self = this;
    amqp.connect(url)
      .then(function(conn) {
        exports.amqpConn = conn;

        conn.on("error", function(err) {
          if (err.message !== "Connection closing") {
            console.error("[AMQP] conn error", err.message);
          }
        });

        conn.on("close", function() {
          console.error("[AMQP] reconnecting");
          return setTimeout(function(){
          	_self.connectToRabbitMQ(url);
          }, 1000);
        });

        console.log("[AMQP] connected");

        _self.createChannel();

    }).catch(function(err){
      console.error("[AMQP]", err.message);
      return setTimeout(function(){
      	_self.connectToRabbitMQ(url);
      }, 1000);
    });
}

RabbitMQ.prototype.createChannel = function(){
	var _self = this;
	exports.amqpConn.createChannel()
	  .then(function(ch){
	  	console.log("[AMQP] channel created");
	    exports.channel = ch;
	    
	    _self.emit('ready');

	    ch.on("error", function(err) {
	      console.error("[AMQP] channel error", err.message);
	    });

	    ch.on("close", function() {
	      console.log("[AMQP] channel closed");
	      ch.connection.close();
	    });

	  }).catch(function(err){
	    console.error("[AMQP] error", err);
	    exports.amqpConn.close();
	  });
}