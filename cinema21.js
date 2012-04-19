var request = require('request'),
		url = require('url'),
		jsdom = require('jsdom');


function Cinema21(req, res) {
	// private variable, reference to Cinema21 object
	var self = this;

	this.req = req;
	this.res = res;
	this.request_param = {
		uri:'http://m.21cineplex.com',
		headers:{
			'referer':'http://m.21cineplex.com',
			'cookie':'city_id=10'
		}
	};

	this.models = {
		city:null,
		theater:null,
		movie:null
	};

	// private variable
	var city_id = 10; // Jakarta, by default

	this.setCityId = function(id) {
		city_id = id;
	};

	this.getCityId = function() {
		return city_id;
	};

	/**
	 * Get model instance
	 *
	 * Valid model are: movie, theater, city
	 *
	 * @param string name model name
	 * @param function modelClass model class
	 * @return mixed null, when model not found. otherwise an Object
	 */ 
	this.getModel = function(modelName, modelClass) {
		var model = null;

		try {
			if (!(this.models[modelName] instanceof modelClass)) {
				console.log('No ' + modelName + ' model instance has been made.');
				this.models[modelName] = new modelClass(this);
			} else {
				console.log(modelName + ' already instantiated.');
			}

			model = this.models[modelName];
		} catch (e) {}

		return model;
	};

	this.getCity = function() {
		return this.getModel('city', City);
	};

	this.getMovie = function() {
		return this.getModel('movie', Movie);
	};

	this.getTheater = function() {
		return this.getModel('theater', Theater);
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
 * Helper to fill movie object literal
 * with corresponding value from $movie
 *
 * @param jQuery $movie is a query object contain movie anchor
 * @param Object movie_structure an object literal
 */
Cinema21.prototype.fillMovieDetail = function($movie, movie_structure) {
	// variety of links:
	// gui.movie_details?sid=&movie_id=12DINE&order=2&find_by=1
	// gui.list_schedule?sid=&movie_id=12AOVR&find_by=1
	// 
	// ps: 'coming soon' link comes with 'order=2'
	//
	// extract movie_id, order, and find_by
	// 'gui.movie_details?sid=&movie_id=12DINE&order=2&find_by=1'.split('&').splice(1)
	// 
	// strip everything before '?', split by '&' delimiter
	// return everything except the first element
	movie_structure['title'] = $movie.html();
	var href = movie_structure['uri'] = $movie.attr('href');

	href = href.replace(/^.*\?/, '').split('&').splice(1);

	for(var index in href) {
		var value = href[index];
		var params = value.split('='); // key=value

		try {
			movie_structure[params[0]] = params[1];
		} catch (e) {
			console.log(e);
		}
	}
};

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

Cinema21.prototype.coming_soon = function() {
	console.log('Cinema21::coming_soon() called...');

	// this is a private variable
	// -- a closure, to be exact
	// it will act as a reference to Cinema21 instance
	var self = this;
	self.request_param.uri += '/gui.list_movie?order=2';

	self.fetch(function(err, window){
		var $ = window.jQuery;
		var movies = [];

		$('#box_content ol#menu_ol_arrow li').each(function(index, element){
			var $element = $(element);
			var $movie = $('a', $element);
			var href = $movie.attr('href');
			console.log('a.href 121:', href);

			var movie_structure = {
				title: $movie.html(),
				uri: href,
				movie_id: null,
				order: null,
				find_by: null
			};

			// gui.movie_details?sid=&movie_id=12DINE&order=2&find_by=1
			// 'coming soon' movie comes with 'order=2'
			//
			// extract movie_id, order, and find_by
			// 'gui.movie_details?sid=&movie_id=12DINE&order=2&find_by=1'.split('&').splice(1)
			// 
			// strip everything before '?', split by '&' delimiter
			// return everything except the first element
			href = href.replace(/^.*\?/, '').split('&').splice(1);
			console.log('138 :: href=', href);

			$.each(href, function(index, value){
				var params = value.split('='); // key=value
				console.log('141 :: params after split =', params);

				try {
					movie_structure[params[0]] = params[1];
				} catch (e) {
					console.log(e);
				}
			});

			movies.push(movie_structure);
		});

		self.res.send(movies);
	});
};


Cinema21.prototype.now_playing = function() {
	console.log('Cinema21::now_playing() called...');

	var self = this;
	self.request_param.uri += '/gui.list_theater?sid=&city_id=' + self.getCityId();

	self.fetch(function(err, window){
			var $ = window.jQuery;

			// get city name
			var found = false;
			var cityName = $('#box_content div#box_title:last').html();

			// "Playing at Ujung Pandang"
			cityName = cityName.match(/Playing at ([a-zA-Z\ ]+)$/i);
			if (cityName.length && (cityName.length == 2)) {
				found = true;
				cityName = cityName[1];
			}

			if (!found) {
				self.res.send(404);
				return;
			}

			// output structure
			var nowPlaying = {
				city: {
					id: self.getCityId(),
					name: cityName
				},
				movies: []
			};
			
			// lets fill movies array
			$('#box_content ol:last li').each(function(){
				var $movie = $('a', this);

				var movie_structure = {
					title: null,
					uri: null,
					movie_id: null,
					order: null,
					find_by: null
				};

				self.fillMovieDetail($movie, movie_structure);

				nowPlaying.movies.push(movie_structure);
			});

			self.res.send(nowPlaying);
	});
};

Cinema21.prototype.city = function(id) {
	var self = this;
	self.setCityId(id);

	self.request_param.uri += '/gui.list_theater?sid=&city_id=' + self.getCityId();

	self.fetch(function(err, window){
			var $ = window.jQuery;

			// get city name
			var found = false;

			// "Playing at Ujung Pandang"
			var cityName = $('#box_content div#box_title:last').html();
			cityName = cityName.match(/Playing at ([a-zA-Z\ ]+)$/i);
			if (cityName.length && (cityName.length == 2)) {
				found = true;
				cityName = cityName[1];
			}

			if (!found) {
				caller.res.send(404);
				return;
			}

			// we are at correct result page
			// lets fill response...
			var response = {
				city: {},
				movies: [],
				theaters: []
			};

			var city = self.getCity();
			city.setId(self.getCityId());
			city.setName(cityName);
			city.$ = $;

			response.city = city.getDetail();
			response.movies = city.getNowPlaying();
			response.theaters = city.getTheaters();

			self.res.send(response);
	});
};

/**
 * City model
 *
 * @author Leonardo Situmorang <leonardo@situmorang.net>
 *
 * @param Cinema21 caller
 */
function City(caller) {
	console.log('create new City instance');

	var self = this;
	var id;
	var name;

	// hold reference to jQuery
	this.$;

	this.setId = function(cityId) {
		id = cityId;
	};

	this.getId = function() {
		return id;
	};

	this.setName = function(cityName) {
		name = cityName;
	};

	this.getName = function() {
		return name;
	};

	/**
	 * City detail
	 * as for now its only return id and name
	 */
	this.getDetail = function() {
		return {
			id: this.getId(),
			name: this.getName()
		};
	};

	this.getNowPlaying = function() {
		var movies = [];

		// lets fill movies array
		var $ = this.$;
		
		try {
			$('#box_content ol:last li').each(function(){
				var $movie = $('a', this);
				var movie = {
					id: $movie.attr('href').match(/movie_id=([0-9a-zA-Z]+)/)[1],
					title: $movie.html()
				};

				movies.push(movie);
			});
		} catch (e) {}

		return movies;
	};

	this.getTheaters = function() {
		var theaters = [];

		var $ = this.$;

		try {
			// cinema21's mobile front-end developer must 
			// be very lame as he/she ended-up misused 'id' attribute 
			// to acted like 'class'
			// well, i'm not saying that it does not work...
			var theaterElements = $('#box_content ol');
			theaterElements.each(function(index, element){
				// last element of '#menu_ol_arrow' is not a theater entry
				if (index === (theaterElements.length - 1)) {
					return;
				}

				var $theater = $('li a', this);

				// http://m.21cineplex.com/gui.list_schedule?sid=&cinema_id=BGRBOTA&find_by=2
				var id = $theater.attr('href').match(/cinema_id\=([0-9a-zA-Z]+)/)[1];

				// "BOTANI XXI<span class="txt_mtix">(MTIX)</span>"
				var name = $theater.html().replace(/\<span.*span\>/, '');

				var mtix = false;
				try {
					mtix = ($theater.html().match(/\(MTIX\)/i).length === 1);
				} catch(e) {}

				var theater = {
					id: id,
					name: name,
					mtix: mtix
				};

				theaters.push(theater);
			});
		} catch (e) {
			console.log(e);
		}

		return theaters;
	};
}

function cinema21(req, res) {
	var r = new Cinema21(req, res);
	return r;
}

module.exports = cinema21;
