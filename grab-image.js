var fs = require('fs'),
		path = require('path'),
		request = require('request'),
		qs = require('qs');


/**
 * example: http://m.21cineplex.com/image_preview.php?type=movie&images=12AVES.jpg&width=100&height=147
 * extract width, height, and file extension
 */
function extractImageInformation(url) {
	var image = {
		width: 0, 
		height: 0, 
		ext: 'jpg'
	};

	var params = qs.parse(url);

	try {
		image.width = parseInt(params.width);
		image.height = parseInt(params.height);
		image.ext = params.images.toLowerCase().match(/\.(?:jpg|jpeg|png)/)[0];
	} catch (e) {
		console.log(e.stack);
	}

	return image;
}

/**
 * @param object movie movie detail (movie id is mandatory)
 * @param object image image detail (resolution, name, extension)
 */
function storeMovieImage(movie) {
	var createFile = false;

	// create path
	var file_path = ['images', 'movie', movie.id].join('/');

	fs.mkdir(file_path, 0755, function(err){
		console.log('create direktori. path: ' + file_path);

		if (err) {
			console.log(err);

			switch (err.code) {
				case 'EEXIST':
					console.log('direktori sudah ada');
					createFile = true;
					break;

				default:
					console.log(err.toString());
					console.log('error on mkdir');
					break;
			}
		} else {
			createFile = true;
		}

		if (createFile) {
			file_path += '/' + [movie.id, image.width, image.height].join('_') + '.' + image.ext;
			console.log('create file. path: ', file_path);

			path.exists(file_path, function(exists){
				if (!exists) {
					console.log('file created.');
					request(movie.url).pipe(fs.createWriteStream(path, {mode: 0755}));
				} else {
					console.log('file already exist.');
				}
			});
		}
	});
}
module.exports = storeMovieImage;


console.log(extractImageInformation(movie.url));

storeMovieImage(movie);
