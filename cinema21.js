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

/**
 * Get available cities
 *
 * GET http://localhost:3000/cinema21/cities
 *
 * @author killedbymemory <leonardo@situmorang.net>
 */
Cinema21.prototype.cities = function() {
	console.log('Cinema21::cities() called...');
	var self = this;
	self.request_param.uri += '/gui.list_city';

	self.fetch(function(err, window){
		console.log('jsdom handler. error: ', err);
		var $ = window.jQuery;
		var cities = [];

		// first thing first, get current city
		// err.. we actually able to fetch this from COOKIE response header ;)
		var cityName = $('#box_title').html();
		console.log('cityName :: 66', cityName);
		cityName = cityName.match(/\s{1}([a-zA-Z]+)$/i); // "My City  Jakarta"
		console.log('cityName.match :: 68', cityName);

		if (cityName.length == 2) {
			cityName = cityName[1];
			console.log('self.getCityId():', self.getCityId());
			cities.push([self.getCityId(), cityName]);
		}
	
		// add the rest of them
		$('#box_content ol').each(function(index, element){
			var $element = $(element);
			console.log('element id: ', $element.attr('id'));
			if ($element.attr('id') == 'menu_ol_arrow') {
				console.log('element id correct');
				var $city = $('li a', $element);
				var href = $city.attr('href');
				console.log('a.href 82:', href);

				// "gui.list_theater?sid=&city_id=32"
				console.log(href.match(/city_id=(\d{1,2})/));
				console.log('length: ', href.match(/city_id=(\d{1,2})/).length);
				href = href.match(/city_id=(\d{1,2})/);
				if (href.length == 2) {
					var cityId = parseInt(href[1]);
					var cityName = $city.html();
					cities.push([cityId, cityName]);
				}
			}
		});

		self.res.send(cities);
	});
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
