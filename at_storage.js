var redis = require('redis');

function Storage() {
	console.log('Storage constructor');

	var self = this;
	var driver;
	var client;

	this.getDriver = function(){
		if (driver == null) {
			console.log('Get redis object');
			driver = redis;
		} else {
			console.log('Return available redis object');
		}

		return driver;
	};

	this.getClient = function(){
		if (client == null) {
			console.log('Get client');
			client = this.getDriver().createClient();
		} else {
			console.log('Return available client');
		}

		return client;
	};

	this.test = function(){
		var client = this.getClient();

	};
}

function at_storage() {
	console.log('at_storage function');
	return new Storage();
}

module.exports = at_storage;
