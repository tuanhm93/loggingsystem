"use strict";

var kue = require('kue');
kue.app.listen(3000);                                              
var queue = kue.createQueue({jobEvents: false}); 
var mongodb = require('mongodb'),
    MongoClient = mongodb.MongoClient,
    moment = require('moment'),
    url = 'mongodb://localhost:1234/test',
    db;
// Connect to mongodb
connectToMongo(url, 1);

queue.process('changeConcurency', function(job, done){
  queue.shutdown(5000, 'saveLog', function(err){
    if(!err){
      for(let i=0; i<kue.workers.length; i++){
        if(kue.workers[i].type == 'saveLog'){
          kue.workers.splice(i, 1);
          i--;
        }
      }

      queue.process('saveLog', Number(job.data.concurentNumber), function(job, done){
        saveLog(job, done);
        console.log(kue.workers.length);
      });

      done();
    }else{
      done(err);
    }
  });
});

function saveLog(job, done){
    var collection = job.data._token;
    delete job.data._token;
    // Create a expire time to automatic remove log
    if(job.data.time != undefined){
        job.data.expireTime = moment(job.data.time).toDate();
    }else{
        job.data.expireTime = moment().toDate();
    }

    db.collection(collection).insertOne(job.data)
        .then(function(results){
            done();
        }).catch(function(err){
            delete job.data.expireTime;
            job.data._token = collection;
            done(err);
        });
}

queue.on('job failed', function(id, err){
    console.log('job failed: '+id);
    console.log(err);
});

queue.on( 'error', function( err ) {
  // Send email or something...
  console.log( 'Oops... ', err );
});

// Watch for job can't be done (always active)
queue.watchStuckJobs(60000); // to watch for stuck jobs

//Fix jobs failed
function fixFailedJobs(){
    queue.failed( function( err, ids ) {
        if(!err){
            ids.forEach( function( id ) {
                kue.Job.get( id, function( err, job ) {
                    if(!err){
                        job.inactive();
                    }
                });
            });
        }
    });
}

setInterval(fixFailedJobs, 60000);

function checkNumberJob(times){
  queue.inactiveCount( function( err, total ) { // others are activeCount, completeCount, failedCount, delayedCount
    if( total > 100000 ) {
      if(times == 1){
        //Send email to administrator
        //If success change times...
      }
    }else{
      if(times != 1){
        times = 1;
      }
    }
    setTimeout(function(){
      checkNumberJob(times);
    }, 60000)
  });
}

checkNumberJob(1);

//Graceful shutdown
process.once( 'SIGTERM', function ( sig ) {
  queue.shutdown( 10000, function(err) {
    console.log( 'Kue shutdown: ', err||'' );
    process.exit( 0 );
  });
});

function connectToMongo(url, times){
    MongoClient.connect(url)
      .then(function(database){
        console.log('Connect to mongodb success');
        db = database;
        queue.process('saveLog', function(job, done){
          console.log(kue.workers.length);
          saveLog(job, done);
        });
        // Listen for some events
        db.on('reconnect', function(data){
          console.log('Reconnect success');
        });
        db.on('error', function(err){
          console.log(err);
        });
        db.on('close', function(err){
          console.log('Disconnect from mongodb')
        });

      }).catch(function(err){
        if(times == 1){
          console.log(err);
          console.log('Trying to connect to mongodb...');
          times++;
        }
     
        setTimeout(function(){
          connectToMongo(url, times);
        }, 3000);
      });
}
