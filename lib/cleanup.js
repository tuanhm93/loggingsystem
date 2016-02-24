var noOp = function (){};

module.exports = function(fn){
	fn = fn || noOp;

	process.on('uncaughtException', fn);
	process.on('SIGINT', fn);
	process.on('SIGTERM', fn);
}

