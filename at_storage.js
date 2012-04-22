var redis = require('redis');

function Storage() {
	var self = this;
	var driver;

	this.getDriver = function(){
		if (driver === null) {
			driver = require('redis');
		}

		return driver;
	};
}
