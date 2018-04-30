"use strict";

export default function() {
	return new Promise(function(resolve, reject) {
		/* Multi Browser Support */
		window.requestAnimationFrame =
			window.requestAnimationFrame ||
			window.mozRequestAnimationFrame ||
			window.webkitRequestAnimationFrame ||
			window.msRequestAnimationFrame ||
			function (f) {
				setTimeout(f, 1000 / options.fallbackFps);
			};
		
		resolve();
	});
}
