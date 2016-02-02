var kue = require('kue');
kue.app.listen(3000);                                              
var queue = kue.createQueue({jobEvents: false}); 
var mongodb = require('mongodb'),
    MongoClient = mongodb.MongoClient,
    moment = require('moment'),
    url = 'mongodb://localhost:1234/test',
    db;

MongoClient.connect(url,function(err, database) {
    if(err) throw err;
    db = database;
    queue.process('saveLog', 20, function (job, done){
        saveLog(job, done);
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

    db.collection(collection).insertOne(job.data, function(err, result) {
        if(err){
            delete job.data.expireTime;
            job.data._token = collection;
            done(err); // Mark job has failed
        }else{
            done(); // Mark job has been completed
        }
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

//Graceful shutdown
process.once( 'SIGTERM', function ( sig ) {
  queue.shutdown( 10000, function(err) {
    console.log( 'Kue shutdown: ', err||'' );
    process.exit( 0 );
  });
});








