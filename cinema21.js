var request = require('request'),
		url = require('url'),
		jsdom = require('jsdom');

var request_param = {
	uri:'http://m.21cineplex.com' + '/gui.list_theater?sid=&city_id=3',
	headers:{
		'Referer':'http://m.21cineplex.com',
		'Cookie':'city_id=10'
	}
};

request(request_param, function(err, response, body){
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

		console.log(nowPlaying);
	});
});
