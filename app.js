
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

//*
app.listen(3000, function(){
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});
//*/
