var request = require('request'),
		url = require('url'),
		jsdom = require('jsdom');


function Cinema21(req, res) {
	this.req = req;
	this.res = res;
	this.request_param = {
		uri:'http://m.21cineplex.com',
		headers:{
			'Referer':'http://m.21cineplex.com',
			'Cookie':'city_id=10'
		}
	};

	// private variable
	var city_id = 10; // Jakarta
	console.log('Cinema21 city_id:', city_id);
	console.log('Cinema21 this.city_id:', this.city_id);

	this.setCityId = function(id) {
		city_id = id;
	};

	this.getCityId = function() {
		return city_id;
	};

	this.fetch = function(jsdomCallback) {
		console.log('Cinema21::fetch() called...');

		request(this.request_param, function(err, response, body){
			if (err && respose.statusCode == 200) {
				console.log('Request error.');
			}

			// use jsdom to parse response body
			// also to attach jquery the scripts
			jsdom.env({
				html:body,
				scripts:['http://code.jquery.com/jquery-1.6.min.js'],
			}, jsdomCallback);
		});
	};
}

};


Cinema21.prototype.now_playing = function() {
	var self = this;

	console.log('Cinema21::now_playing() called...');

	self.request_param.uri += '/gui.list_theater?sid=&city_id=' + self.getCityId();

	request(self.request_param, function(err, response, body){
		var self = this;

		if (err && respose.statusCode == 200) {
			console.log('Request error.');
		}

		// use jsdom to parse response body
		// also to attach jquery the scripts
		jsdom.env({
			html:body,
			scripts:['http://code.jquery.com/jquery-1.6.min.js'],
		}, 
		function(err, window){
			var $ = window.jQuery;
			var nowPlaying = [];
			
			$('#box_content ol:last li').each(function(){
				console.log($('a', this).attr('href'));
				$anchor = $('a', this);
				nowPlaying.push([$anchor.html(), $anchor.attr('href')]);
			});

			var output = '';
			$(nowPlaying).each(function(index, element){
				output += nowPlaying[index].join(' - ') + '<br />';
			});

			console.log(output);
			//_this._res.end(output);
			_this._res.json(nowPlaying);
		});
	});
};

function cinema21(req, res) {
	var r = new Cinema21(req, res);
	return r;
}

module.exports = cinema21;
