var request = require('request'),
    url = require('url'),
    jsdom = require('jsdom'),
    at_storage = require('./at_storage'),
    events = require('events'),
    emitter = new events.EventEmitter,
    storeMovieImage = require('./grab-image');

function Cinema21(req, res) {
  // private variable, reference to Cinema21 object
  var self = this;

  this.req = req;
  this.res = res;

  this.base_uri = 'http://m.21cineplex.com';

  this.request_param = {
    uri: this.base_uri,
    headers:{
      'referer':'http://m.21cineplex.com',
      'cookie':['city_id=%city_id%', 'BATMAN_MOBILEWEB=MOBILEWEB_MATRIX'].join(';'),
      'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.7; rv:12.0) Gecko/20100101 Firefox/12.0'
    }
  };

  this.models = {
    city:null,
    theater:null,
    movie:null
  };

  // storage client (default driver: redis)
  var storageClient;

  // *detail* should be re-evaluate every 6 hours
  var secondBeforeExpire = 60 * 60;

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

  this.getExpire = function() {
    return secondBeforeExpire;
  };

  this.fetch = function(jsdomCallback) {
    console.log('Cinema21::fetch() called...');

    // supply city id to cookie
    debugger;
    var cookie = this.request_param.headers.cookie;
    this.request_param.headers.cookie = cookie.replace('%city_id%', this.getCityId());
    console.log('Request param: ', this.request_param);

    request(this.request_param, function(err, response, body){
      debugger;
      //console.log('Response header:', response);
      //console.log(body);

      if (err && response.statusCode == 200) {
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

  this.render = function(result) {
    // close redis connection
    (storageClient && storageClient.end());

    // result from redis is string
    if (typeof result == "string") {
      this.res.contentType('application/json');
    }

    this.res.send(result);
  };

  // set default expire to key
  // and later call cb (callback function)
  // ps: should be using 'multi' (redis's transaction) instead...
  this.expire = function(key, cb) {
    this.getStorageClient().expire(key, this.getExpire(), function(){
      console.log('set expire to:' + key + '. redis response:', arguments);
      cb();
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
  debugger;
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
      self.res.send(result);
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
      var $movies = $('#box_content ol#menu_ol_arrow li');

      /**
       * a synchronous approach
       * to get movie detail,
       * one movie at a time.
       *
       * by put it this way,
       * we only made one request
       * at a time to cinema21's
       * website.
       *
       * i also use a movie object
       * model, thus I needed to
       * duplicate the movie detail
       * as its passed by reference
       * (object).
       *
       */
      function getMovieDetail(movie_id){
        self.movie(movie_id, function(movie){
          // 
          var movie = $.extend({}, movie);
          console.log(movie);
          movies.push(movie);
          console.log("\n\n\n\n" + movie.id + " =========================\n");

          $movies = $movies.next(); // iterate

          if ($movies.length > 0) {
            movie_id = $movies.first().html().match(/movie_id=([0-9a-zA-Z]+)/)[1];
            getMovieDetail(movie_id);
          } else {
            // movies complete.
            // store result to storage
            console.log('store coming soon movies to redis');
            self.getStorageClient().set('coming_soon', JSON.stringify(movies), function(err, result){
              if (err) {
                console.log('fail to store coming-soon movies to redis');
              }

              if (result == 'OK') {
                console.log('successfully store coming-soon movies to redis. response:', arguments);

                // set an expire to this 'cache'-like item
                self.expire('coming_soon', function(){
                  self.render(movies);
                });
              }
            });
          }
        });
      }

      if ($movies.length > 0) {
        debugger;
        // start from first element
        var movie_id = $movies.first().html().match(/movie_id=([0-9a-zA-Z]+)/)[1];
        getMovieDetail(movie_id);
      }
    });
  }

  // try to get 'coming soon' from redis
  self.getStorageClient().get('coming_soon', function(err, result){
    console.log('get "coming_soon" from redis. response:', arguments);
    if (err || result === null) {
      console.log('either error or "coming_soon" is not found. try fetch');
      fetchComingSoon();
    } else {
      console.log('"coming_soon" found on redis');
      self.res.send(result);
    }
  });
};

Cinema21.prototype.city = function(id) {
  var self = this;
  self.setCityId(id);

  // city result 'cache' key
  var key = ['city', self.getCityId(), 'detail'].join(':');

  function fetchCity() {
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
          self.res.send(404);
          return;
        }

        // we are at correct result page
        // lets fill response...
        var response = {
          city: {},
          movies: [],
          theaters: []
        };

        // City model
        var city = self.getCity();
        city.setId(self.getCityId());
        city.setName(cityName);
        city.$ = $;

        response.city = city.getDetail();
        response.movies = city.getNowPlaying();
        response.theaters = city.getTheaters();

        // store city detail to redis
        console.log('store city result to redis');
        self.getStorageClient().set(key, JSON.stringify(response), function(err, result){
          if (err) {
            console.log('unable to save city detail.');
          }

          if (result == 'OK') {
            console.log('city detail successfully saved');

            // set expire to city detail
            self.expire(key, function(){
              self.render(response);
            });
          }
        });
    });
  }

  // get complete city information from redis
  self.getStorageClient().get(key, function(err, result){
    if (err | result === null) {
      console.log('city detail not found. try fetch new data');
      fetchCity();
    } else {
      console.log('city detail found on redis', result);
      self.render(result);
    }
  });
};


Cinema21.prototype.theater = function(id) {
  var self = this;
  var cacheKey = ['theater', id, 'detail'].join(':');

  function fetchTheater() {
    self.request_param.uri += '/gui.list_schedule?sid=&find_by=2&cinema_id=' + id;

    self.fetch(function(err, window){
      debugger;
      var $ = window.jQuery;

      var response = {
        theater: {},
        movies: []
      };

      var theater = self.getTheater();
      theater.setId(id);
      theater.$ = $;

      var theaterDetailDone = false;
      var theaterNowPlayingDone = false;

      emitter.on('theaterDetailDone', function(detail){
        console.log('theater detail done. put detail into response');
        debugger;
        theaterDetailDone = true;
        response.theater = detail;
        emitter.emit('theaterDone', 'theaterDetailDone');
      });

      emitter.on('theaterNowPlayingDone', function(movies){
        console.log('theater now playing done. put movies into response');
        debugger;
        theaterNowPlayingDone = true;
        response.movies = movies;
        emitter.emit('theaterDone', 'theaterNowPlayingDone');
      });

      emitter.on('theaterDone', function(caller){
        debugger;
        console.log('Called by: ', caller);
        console.log('theaterDetailDone: ', theaterDetailDone);
        console.log('theaterNowPlayingDone: ', theaterNowPlayingDone);
        if (theaterDetailDone && theaterNowPlayingDone) {
          console.log('theaterDetail and theaterNowPlaying is completed!');

          console.log('store theater detail and now playing movies to redis');
          self.getStorageClient().set(cacheKey, JSON.stringify(response), function(err, result){
            if (err) {
              console.log('unable to store theater detail to redis');
            }

            if (result == 'OK') {
              console.log('theater detail successfully saved');

              self.expire(cacheKey, function(){
                self.render(response);
              });
            }
          });
        } else {
          console.log('Not completed yet. Still cannot render theater response');
        }
      });

      try {
        theater.getDetail();
        theater.getNowPlaying();
      } catch(e) {
        console.log(e);
        self.render(404);
      }
    });
  }

  self.getStorageClient().get(cacheKey, function(err, result){
    if (err | result === null) {
      console.log('No theater detail found on redis. Try fetch content.');
      fetchTheater();
    } else {
      console.log('Theater detail found on redis:', result);
      self.render(result);
    }
  });
};

/**
 * Second argument is callback function
 * which will be triggered once the movie 
 * detail gathered.
 *
 * It will come handy when another controller
 * need to use movie detail.
 *
 * When callback is provided, movie detail
 * is always in object literal format instead
 * of json string -- especially when movie
 * detail is already exist in redis (stored
 * in string, thus need to re-parse)
 */
Cinema21.prototype.movie = function(id, cb) {
  var self = this;
  var key = ['movie', id, 'detail'].join(':');

  // this is a proxy to Cinema21.render()
  function render(detail) {
    if (typeof cb == "function") {
      console.log('movie detail is done. callback is available, passed to it');
      console.log('callback should always expecting object instead of json formatted string');
      
      if (typeof detail == "string") {
        detail = JSON.parse(detail);
      }

      cb(detail);
    } else {
      console.log('movie detail is done. put it into response');
      self.render(detail);
    }
  }

  function fetchMovie() {
    self.request_param.uri = self.base_uri + '/gui.movie_details?sid=&movie_id=' + id;

    self.fetch(function(err, window){
      var $ = window.jQuery;

      var movie = self.getMovie();
      movie.setId(id);
      movie.$ = $;

      try {
        movie.getDetail(function(detail){
          self.getStorageClient().set(key, JSON.stringify(detail), function(err, result){
            console.log(detail.id + ' -- movie detail (string) save to redis. response: ', arguments);

            self.expire(key, function(){
              render(detail);
            });
          });
        });
      } catch(e) {
        // take me some time to figure out e.stack -_-"
        // found it on:
        // - http://www.senchalabs.org/connect/errorHandler.html
        // - https://github.com/senchalabs/connect/blob/master/lib/middleware/errorHandler.js
        //
        // we can also use connect errorHandler though
        console.log(e.stack);
        self.render(404);
      }
    });
  }
  
  self.getStorageClient().get(key, function(err, result){
    if (err | result === null) {
      console.log('No movie detail found on redis. Try fetch content');
      fetchMovie();
    } else {
      console.log('Movie detail found on redis:', result);
      render(result);
    }
  });
};


/**
 * Get theaters who play the movie within a city
 * http://m.21cineplex.com/gui.list_schedule?sid=&movie_id=12AVE3&order=1&find_by=1
 */
Cinema21.prototype.movieByCity = function(movie_id, city_id) {
  var self = this;
  var key = ['movie', movie_id, 'city', city_id, 'detail'].join(':');

  function fetchMovieByCity() {

    self.setCityId(city_id);
    self.request_param.uri += '/gui.list_schedule?sid=&order=1&find_by=1&movie_id=' + movie_id;

    self.fetch(function(err, window){
      debugger;
      var response = {
        movie: null,
        theaters: []
      };

      // get theaters and theirs schedule
      var $ = window.jQuery;
      var theaters = response.theaters;
      var theaterId = 0;

      $('#box_content *').each(function(index, element){
        debugger;
        // create new theater element
        // when the loop started or a delimiter is found
        if (theaters[theaterId] === undefined) {
          var theaterData = {
            id: null,
            name: null,
            schedule: []
          };

          // add theater
          theaters.push(theaterData);
        }

        // theater delimiter
        if ($(this).hasClass('separate_menu')) {
          // initialise / increment scheduleId
          theaterId++;
          return;
        }

        // this is the most important object
        // reference to current theater
        var theater = theaters[theaterId];

        // reference to current DOM object
        var $this = $(this);

        var elementId = $this.attr('id');
        var elementClass = $this.attr('class');

        if (elementId === null || elementClass === null) {
          return;
        }

        // extract theater name and its id
        if (elementId == 'menu_ol_schedule') {
          theater.id = $('li a', $this).attr('href').match(/cinema_id\=([0-9a-zA-Z]+)/)[1];
          theater.name = $('li a', $this).text();
          return;
        }

        // extract theater's movie schedule(s)
        // each schedule represent a day
        if (elementClass == 'schedule_timeshow') {
          // reference to current theater's schedule
          var schedules = theater.schedule;

          var scheduleId = 0;

          $('*', $this).each(function(index, element){
            debugger;
            if (schedules[scheduleId] === undefined) {
              var scheduleData = {
                date: null,
                time: [],
                price: 0,
                mtix: false
              };

              // create new schedule
              schedules.push(scheduleData);
            }

            // delimiter
            if ($(this).hasClass('p_list')) {
              // initialise / increment scheduleId
              // this will trigger new schedule to be created
              scheduleId++;
              return;
            }

            // reference for current schedule
            var schedule = schedules[scheduleId];

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

          return;
        }
      });

      // get movie detail
      self.movie(movie_id, function(movie){
        response.movie = movie;

        // store result to redis, set expire, and render
        console.log('try to store move detail + playing at to redis');
        self.getStorageClient().set(key, JSON.stringify(response), function(err, result) {
          if (err) {
            console.log('unable to store movie detail and playing_at within city to redis');
          }

          if (result == 'OK') {
            console.log('movie detail and playing_at within city successfully stored into redis');

            self.expire(key, function(){
              self.render(response);
            });
          }
        });
      });
    });
  }
  
  self.getStorageClient().get(key, function(err, result){
    if (err | result === null) {
      console.log('No movie detail and list of theater per city found on redis. Try fetch content');
      fetchMovieByCity();
    } else {
      console.log('Movie detail and list of theater per city found on redis:', result);
      self.render(result);
    }
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

        // store movie to redis
        console.log('store city now-playing movies');
        var key = ['movie', movie.id].join(':');
        caller.getStorageClient().hmset(key, movie, function(err, response){
          if (err) {
            console.log('unable to save city now-playing movie.');
          }

          if (response == 'OK') {
            console.log('city now-playing movie successfully saved');
          }
        });
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
          city_id: self.getId(),
          name: name,
          mtix: mtix
        };

        theaters.push(theater);

        // store theater to redis
        console.log('store theater to redis');
        var key = ['theater', theater.id].join(':');
        caller.getStorageClient().hmset(key, theater, function(err, response){
          if (err) {
            console.log('unable to save theater.');
          }

          if (response == 'OK') {
            console.log('theater successfully saved');
          }
        });
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
    var key = ['theater', this.getAttribute('id')].join(':');

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
        this.setAttribute('phone', addressAndPhone[1].replace(/.* : /, ''));
      } else {
        console.log('No theater address nor phone');
      }
    }

    // store/update theater info
    caller.getStorageClient().hmset(key, attributes, function(err, result){
      if (err) {
        console.log('unable to store theater info to redis');
      }

      if (result == 'OK') {
        console.log('theater info successfully saved');
      }
    });

    emitter.emit('theaterDetailDone', attributes);
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

    for(var i in movies) {
      var movie = movies[i];

      // store theater's movie schedule
      // theater:JKTGAND:movie:122JST:schedule
      var key = [
        'theater', 
        this.getAttribute('id'), 
        'movie', 
        movie.id, 
        'schedule'
      ].join(':');

      caller.getStorageClient().set(key, JSON.stringify(movie.schedule), function(err, result){
        if (err) {
          console.log("unable to store theater's movie schedule");
        }

        if (result == 'OK') {
          console.log("theater's movie schedule successfullly saved");
        }
      });
    }

    emitter.emit('theaterNowPlayingDone', movies);
  };
}

function Movie(caller) {
  console.log('create new Movie instance');

  var self = this;

  var attributes = {
    id: null,
    title: null,
    synopsis: null,
    producer: null,
    distributor: null,
    genre: null,
    duration: null,
    writer: null,
    director: null,
    player: null,
    site: null,
    image: null,
    local: false
  };

  this.setAttribute = function(name, value) {
    attributes[name] = value;
  };

  this.getAttribute = function(name) {
    try {
      return attributes[name];
    } catch(e) {
      console.log('No such attribute exist: ' + name, e);
      return undefined;
    }
  };

  this.$;

  this.setId = function(id) {
    this.setAttribute('id', id);
  };

  this.getId = function() {
    return this.getAttribute('id');
  };

  this.getDetail = function(cb) {
    var $ = this.$;
    var key = ['movie', this.getId()].join(':');

    var $movieDetail = $('#box_content');
    this.setAttribute('title', $('#box_title', $movieDetail).text());
    this.setAttribute('image', 'http://m.21cineplex.com/' + $('img', $movieDetail).attr('src'));
    this.setAttribute('synopsis', $('div.txt_img', $movieDetail).html().replace(/\r\n|\n|\<br\>|\<br \/\>/g, ''));

    $('p.p_movie', $movieDetail).each(function(index, element){
      var attribute = $(this).text().match(/^([A-Za-z]+)\:(.*)$/);
      console.log('movie attribute found: ', attribute);
      var key = attribute[1].trim().toLowerCase();
      var value = attribute[2].trim();
      self.setAttribute(key, value);
    });

    // local movie id starts with 02
    this.setAttribute('local', (this.getId().substr(0,2) === '02'));

    // only update/insert non-null attribute
    var affectedAttributes = {};
    for(var name in attributes) {
      if (attributes[name] !== null) {
        affectedAttributes[name] = attributes[name];
      }
    }

    // at this point movie attributes is completed
    // fetch movie image and store it into local storage
    // and overwrite movie image url with local image path
    // 
    // imageLocalPath is relative path
    storeMovieImage(attributes, function(imageLocalPath){
      // in order to build a proper url
      // we need to get request object of main application
      // to do so, we have 'caller' variable whom
      // passed when this model is instantiated.
      // 
      // 'caller' is Cinema21 object and it's hold
      // request object
      var host = caller.req.headers.host;
      var tls = caller.req.connection.encrypted;
      var url = 'http' + (tls ? 's' : '') + '://' + host + '/' +  imageLocalPath;
      self.setAttribute('image', url);

      caller.getStorageClient().hmset(key, affectedAttributes, function(err, result){
        if (err) {
          console.log('Unable to store movie detail to redis');
        }

        if (result == 'OK') {
          console.log('Movie detail successfully saved to redis');
        }

        // a callback, 
        cb(attributes);
      });
    });
  };
}

function cinema21(req, res) {
  var r = new Cinema21(req, res);
  return r;
}

module.exports = cinema21;
