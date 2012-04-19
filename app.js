
/**
 * Module dependencies.
 */
var express = require('express'),
		routes = require('./routes'),
		cinema21 = require('./cinema21');

var app = module.exports = express.createServer();

// Configuration
app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

// Routes
// todo:
// - implement a better routing
//   consult this: http://expressjs.com/guide.html#passing-route%20control
app.get('/cinema21/cities', function(req, res){
	cinema21(req, res).cities();
});

app.get('/cinema21/coming-soon', function(req, res){
	cinema21(req, res).coming_soon();
});

// http://localhost:3000/cinema21/city/1
// http://localhost:3000/cinema21/city/1/
// return city information, now-playing movies, and list of theater
// within the city
//
// http://localhost:3000/cinema21/theater/1
// http://localhost:3000/cinema21/theater/1/
// return theater information, now-playing movies
app.get(/^\/cinema21\/(city|theater)\/(\d{1,4}|[A-Z]{7})(?:\/)?$/, function(req, res){
	var cinema21Obj = cinema21(req, res);

	try {
		var action = req.params[0];
		var id = req.params[1];

		// in javascript, property (either method or attribute)
		// is accessible using brackets.
		// it's pretty similar to associative array
		//
		// mix it with call method[1], we can call
		// class method which its name is resolved
		// on runtime. 
		//
		// call method in detail: 
		// 1] https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Function/call
		//
		// first argument supplied into call,
		// will be act as 'this' within the method (context)
		cinema21Obj[action].call(cinema21Obj, id);
	} catch (e) {
		console.log(e);
	}
});

//*
app.listen(3000, function(){
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});
//*/
