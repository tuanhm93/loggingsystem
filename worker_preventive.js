"use strict";

var Queue = require('bull'),
    cluster = require('cluster');

var logQueue = Queue("logqueue3", 6379, '127.0.0.1');

if(cluster.isMaster){
	var numWorkers = require('os').cpus().length;

    console.log('Master cluster setting up ' + numWorkers + ' workers...');

    for(var i = 0; i < numWorkers; i++) {
        cluster.fork();
    }

	cluster.on('exit', function(worker, code, signal) {
		// console.log('Worker ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);
		// console.log('Starting a new worker');
		cluster.fork();
	});
}else{
	var MongoClient = require('mongodb').MongoClient;
	var url = 'mongodb://localhost:1234/test';
	MongoClient.connect(url, {
		bufferMaxEntries: 0 
	},function(err, db) {
	    if(err) throw err;
	    
	    logQueue.process(function(job){
	   		var collection = job.data['_token'];
	   		delete job.data['_token'];
	   		// Create a expire time to automatic remove log
	   		if(job.data['time'] != undefined){
	   			job.data.expireTime = job.data['time'];
	   		}else{
	   			job.data.expireTime = new Date().getTime();
	   		}
	   		
	    	db.collection(collection).insertOne(job.data, function(err, result) {
		    	if(err){
		    		console.log(err);
		    		job.retry(); // Force log back to queue
		    	}else{
		    		job.remove(); // Remove log has been writen successful
		    	}
		    });
		});
	});
}