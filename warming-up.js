/**
 * Warming up script
 * 2012-05-29
 */

var request = require('request');
var base_uri = 'http://localhost:3000/cinema21';

// starts with jakarta's now-playing
// as it provide most of cinema21's movies
request({uri: base_uri + '/city/10'}, function(err, response, body){
  if (err) {
    console.log('unable to fetch Jakarta');
    console.log(err);
    return;
  }

  // continue with list of city
  request({uri: base_uri + '/cities'}, citiesHandler);
});


function citiesHandler(err, response, body){
  if (err) {
    console.log(err);
    return;
  }

  if (response.statusCode === 200) {
    console.log(response.request.href + ' >> DONE');
    var cities = JSON.parse(body);

    if (cities.length > 0) {
      for(var i in cities) {
        var city = cities[i];

        // get per-city now-playing
        var request_param = {uri: base_uri + '/city/' + city.id};
        console.log('requesting ' + request_param.uri);
        request(request_param, cityHandler);
      }
    }
  } else {
    console.log(response.request.href + ' >> FAIL');
  }
}

function cityHandler(err, response, body){
  try {
    var url = response.request.href;
    console.log(url + ' >> ' + ((response.statusCode === 200) ? 'DONE' : 'FAIL'));
  } catch(e) {
    debugger;
    console.log(e.stack);
  }
}
