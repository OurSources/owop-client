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
		
		Array.prototype.remove = function(item) {
			var i = this.indexOf(item);
			if (i !== -1) {
				this.splice(i, 1);
				return true;
			}
			
			return false;
		};
		
		resolve();
	});
}
