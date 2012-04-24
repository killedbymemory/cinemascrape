var request = require('request'),
		url = require('url'),
		jsdom = require('jsdom'),
		at_storage = require('at_storage');


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

	// storage client (default driver: redis)
	var storageClient;

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

	this.getStorageClient = function() {
		if (storageClient == null) {
			storageClient = at_storage().getClient();
		}

		return storageClient;
	};

	this.fetch = function(jsdomCallback) {
		console.log('Cinema21::fetch() called...');
		console.log('Request param: ', this.request_param);

		request(this.request_param, function(err, response, body){
			//console.log('Response header:', response);
			//console.log(body);

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
	var cities = [];

	function fetchCities() {
		self.request_param.uri += '/gui.list_city';

		self.fetch(function(err, window){
			//console.log('jsdom handler. error: ', err);
			var $ = window.jQuery;

			// first thing first, get current city
			// err.. we actually able to fetch this from COOKIE response header ;)
			var cityName = $('#box_title').html();
			//console.log('cityName :: 66', cityName);
			cityName = cityName.match(/\s{1}([a-zA-Z]+)$/i); // "My City  Jakarta"
			//console.log('cityName.match :: 68', cityName);

			if (cityName.length == 2) {
				cityName = cityName[1];
				//console.log('self.getCityId():', self.getCityId());
				cities.push({id: self.getCityId(), name: cityName});
			}
		
			// add the rest of them
			$('#box_content ol').each(function(index, element){
				var $element = $(element);
				//console.log('element id: ', $element.attr('id'));
				if ($element.attr('id') == 'menu_ol_arrow') {
					//console.log('element id correct');
					var $city = $('li a', $element);
					var href = $city.attr('href');
					//console.log('a.href 82:', href);

					// "gui.list_theater?sid=&city_id=32"
					//console.log(href.match(/city_id=(\d{1,2})/));
					//console.log('length: ', href.match(/city_id=(\d{1,2})/).length);
					href = href.match(/city_id=(\d{1,2})/);
					if (href.length == 2) {
						var cityId = parseInt(href[1]);
						var cityName = $city.html();
						cities.push({id: cityId, name: cityName});
					}
				}
			});

			// create a record on storage (redis)
			// for each city
			for(var i in cities) {
				var cityId = cities[i].id;
				var key = ['city', cityId].join(':');
				var value = cities[i];
				console.log(key, value);

				self.getStorageClient().hmset(key, value, function(err, response){
					if (err) {
						console.log('unable to store city entry');
					}

					if (response == 'OK') {
						console.log('city entry successfully stored:');
					}
				});
			}

			// store result to storage (redis)
			self.getStorageClient().set('cities', JSON.stringify(cities), function(){
				console.log('store cities to redis. response:', arguments);
			});

			self.res.send(cities);
		});
	}

	// try to get cities from storage (redis)
	console.log('try to get cities from redis');
	self.getStorageClient().get('cities', function(err, result){
		console.log('get "cities" from redis response:', arguments);
		if (err || (result === null))  {
			console.log('either error or no cities found from redis. try to fetch');
			fetchCities();
		} else {
			console.log('cities record found from redis.');
			cities = JSON.parse(result);
			self.res.send(cities);
		}
	});
};

Cinema21.prototype.coming_soon = function() {
	console.log('Cinema21::coming_soon() called...');

	// this is a private variable
	// -- a closure, to be exact
	// it will act as a reference to Cinema21 instance
	var self = this;
	var movies = [];

	function fetchComingSoon() {
		self.request_param.uri += '/gui.list_movie?order=2';

		self.fetch(function(err, window){
			var $ = window.jQuery;

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

			// store result to storage
			console.log('store coming soon movies to redis');
			var storage = at_storage().getClient();
			storage.set('coming_soon', JSON.stringify(movies), function(){
				console.log('redis response:', arguments);
			});

			self.res.send(movies);
		});
	}

	// try to get 'coming soon' from redis
	var storage = at_storage().getClient();
	storage.get('coming_soon', function(err, result){
		console.log('get "coming_soon" from redis. response:', arguments);
		if (err || result === null) {
			console.log('either error or "coming_soon" is not found. try fetch');
			fetchComingSoon();
		} else {
			console.log('"coming_soon" found on redis');
			movies = JSON.parse(result);
			self.res.send(movies);
		}
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


Cinema21.prototype.theater = function(id) {
	var self = this;

	self.request_param.uri += '/gui.list_schedule?sid=&find_by=2&cinema_id=' + id;

	self.fetch(function(err, window){
		var $ = window.jQuery;

		var response = {
			theater: {},
			movies: []
		};

		var theater = self.getTheater();
		theater.setId(id);
		theater.$ = $;

		try {
			response.theater = theater.getDetail();
			response.movies = theater.getNowPlaying();
		} catch(e) {
			console.log(e);
			response = 404;
		}

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

function Theater(caller) {
	console.log('create new Theater instance');

	var self = this;

	var attributes = {
		id: null,
		name: null,
		city: null,
		address: null,
		phone: null
	};

	this.setAttribute = function(name, value) {
		attributes[name] = value;
	};

	this.getAttribute = function(name) {
		try {
			return attributes[name];
		} catch (e) {
			console.log('No such attribute exist: ' + name, e);
			return undefined;
		}
	};

	this.$;

	this.setId = function(theaterId) {
		this.setAttribute('id', theaterId);
	};

	this.getDetail = function() {
		var $ = this.$;

		var $theaterInfo = $('#box_content table td');

		if ($theaterInfo.length === 2) {
			debugger;
			// BOTANI XXI - Ambon
			// note that city name is optional
			var nameAndCity = /^([0-9a-zA-Z\ ]+) \- ([0-9a-zA-Z\ ]+)?$/;
			var theaterName = $($theaterInfo[0]).html().match(nameAndCity);
			if (theaterName && (theaterName.length > 0)) {
				this.setAttribute('name', theaterName[1]);

				if (theaterName[2] != undefined) {
					this.setAttribute('city', theaterName[2]);
				} else {
					console.log('No city name');
				}
			} else {
				console.log('No theater name nor city');
			}

			// BOTANI SQUARE LT. 2, JL. RAYA PAJAJARAN
			// TELEPON : (0251) 840 0821
			var addressAndPhone = $($theaterInfo[1]).text().split("\r\n");
			if (addressAndPhone && (addressAndPhone.length >= 2)) {
				this.setAttribute('address', addressAndPhone[0]);
				this.setAttribute('phone', addressAndPhone[1].replace(/.*TELEPON : /, ''));
			} else {
				console.log('No theater address nor phone');
			}
		}

		return attributes;
	};

	this.getNowPlaying = function() {
		var movies = [];

		// lets fill movies array
		var $ = this.$;
		
		// get movie
		$('#box_content ol').each(function(index, element){
			var $this = $(this);

			if ($this.attr('id') == 'menu_ol_schedule') {
				var $movie = $('li a', $this);
				var movie = {
					id: $movie.attr('href').match(/movie_id=([0-9a-zA-Z]+)/)[1],
					title: $movie.html(),
					schedule: []
				};

				movies.push(movie);
			}
		});

		// get movie schedule
		$('div.schedule_timeshow').each(function(index, element){
			debugger;
			var $this = $(this);

			// reference to movie object
			var movie = movies[index];
			var scheduleId = 0;

			$('*', $this).each(function(index, element){
				debugger;
				if (movie.schedule[scheduleId] === undefined) {
					var scheduleData = {
						date: null,
						time: [],
						price: 0,
						mtix: false
					};

					// create new schedule
					movie.schedule.push(scheduleData);
					console.log('Create new schedule.', movie.schedule);
				}

				// delimiter
				if ($(this).hasClass('p_list')) {
					// initialise / increment scheduleId
					scheduleId++;
					return;
				}

				var schedule = movie.schedule[scheduleId];

				if ($(this).hasClass('p_date')) {
					// Date: Kamis,19-04-2012 (MTIX)
					schedule.date = $(this).text().match(/[0-9]{2}-[0-9]{2}-201[2-9]/)[0];

					var mtix = $(this).text().match(/\(MTIX\)$/);
					(mtix && (schedule.mtix = (mtix.length === 1)));
					return;
				}

				if ($(this).hasClass('p_time')) {
					// [12:30] [14:40] [16:50] [19:00] [21:10]
					var occurrence = $(this).text().trim().split(' ');
					if (occurrence && (occurrence.length > 0)) {
						for(var i in occurrence) {
							var time = occurrence[i].replace(/[\[\]]/g,'');
							schedule.time.push(time);
						}
					} else {
						console.log('No movie time(s)');
					}
					return;
				}

				if ($(this).hasClass('p_price')) {
					// HTM: Rp.25,000
					var price = $(this).html().match(/[1-9][0-9]\,[0-9]{3}$/);
					if (price && price.length === 1) {
						schedule.price = parseInt(price[0].replace(',', ''));
					} else {
						console.log('No movie ticket price');
					}
					return;
				}
			});
		});

		return movies;
	};
}

function cinema21(req, res) {
	var r = new Cinema21(req, res);
	return r;
}

module.exports = cinema21;
