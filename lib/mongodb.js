"use strict";

var EventEmitter = require('events').EventEmitter,
	MongoClient = require('mongodb').MongoClient;

exports = module.exports = MongoDB;

/**
 * Inherit from `EventEmitter.prototype`.
 */

MongoDB.prototype.__proto__ = EventEmitter.prototype;

function MongoDB(options){
	this.options = options;
  this.options.url = "mongodb://" + options.username+":"+options.password
                     + "@" + options.host+":"+options.port+"/"+options.database;
}

MongoDB.prototype.init = function(){
	this.connectToMongoDB(this.options.url);
}

MongoDB.prototype.connectToMongoDB = function(url){
	var _self = this;
    MongoClient.connect(url)
      .then(function(db){
        console.log('[MongoDB] connected');

        _self.emit('ready', db);
        
        // Listen for some events
        db.on('reconnect', function(data){
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
        return setTimeout(function(){
        	_self.connectToMongoDB(url);
        }, 1000);
      });
}