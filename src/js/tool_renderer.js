'use strict';
import { EVENTS as e, options } from './conf.js';
import { eventSys, PublicAPI } from './global.js';

export const cursors = {
	set: new Image(),
	cursor: {imgpos: [0, 0], hotspot: [0, 0]},
	move: {imgpos: [1, 0], hotspot: [18, 18]},
	pipette: {imgpos: [0, 1], hotspot: [0, 28]},
	erase: {imgpos: [0, 2], hotspot: [4, 26]},
	zoom: {imgpos: [1, 2], hotspot: [19, 10]},
	fill: {imgpos: [1, 1], hotspot: [3, 29]},
	brush: {imgpos: [0, 3], hotspot: [0, 26]},
	select: {imgpos: [2, 0], hotspot: [0, 0]}, // needs better hotspot
	selectprotect: {imgpos: [4, 0], hotspot: [0, 0]},
	copy: {imgpos: [3, 0], hotspot: [0, 0]}, // and this
	paste: {imgpos: [3, 1], hotspot: [0, 0]}, // this too
	cut: {imgpos: [3, 2], hotspot: [11, 5]},
	wand: {imgpos: [3, 3], hotspot: [0, 0]},
	shield: {imgpos: [2, 3], hotspot: [18, 18]},
	kick: {imgpos: [2, 1], hotspot: [3, 6]},
	ban: {imgpos: [3, 0], hotspot: [10, 4]},
	write: {imgpos: [1, 3], hotspot: [10, 4]} // fix hotspot
};

PublicAPI.cursors = cursors;

function reduce(canvas) { /* Removes unused space from the image */
	var nw = canvas.width;
	var nh = canvas.height;
	var ctx = canvas.getContext('2d');
	var idat = ctx.getImageData(0, 0, canvas.width, canvas.height);
	var u32dat = new Uint32Array(idat.data.buffer);
	var xoff = 0;
	var yoff = 0;
	for(var y = 0, x, i = 0; y < idat.height; y++) {
		for(x = idat.width; x--; i += u32dat[y * idat.width + x]);
		if(i) { break; }
		yoff++;
	}
	for(var x = 0, y, i = 0; x < idat.width; x++) {
		for(y = nh; y--; i += u32dat[y * idat.width + x]);
		if(i) { break; }
		xoff++;
	}
	for(var y = idat.height, x, i = 0; y--;) {
		for(x = idat.width; x--; i += u32dat[y * idat.width + x]);
		if(i) { break; }
		nh--;
	}
	for(var x = idat.width, y, i = 0; x--;) {
		for(y = nh; y--; i += u32dat[y * idat.width + x]);
		if(i) { break; }
		nw--;
	}
	canvas.width = nw;
	canvas.height = nh;
	ctx.putImageData(idat, -xoff, -yoff);
}

function shadow(canvas, img) {
	/* Make a bigger image so the shadow doesn't get cut */
	canvas.width  = 2 + img.width + 6;
	canvas.height = 2 + img.height + 6;
	var ctx = canvas.getContext('2d');
	ctx.shadowColor = '#000000';
	ctx.globalAlpha = 0.5; /* The shadow is too dark so we draw it transparent */
	ctx.shadowBlur  = 4;
	ctx.shadowOffsetX = 2;
	ctx.shadowOffsetY = 2;
	ctx.drawImage(img, 2, 2);
	ctx.globalAlpha = 1;
	ctx.shadowColor = 'rgba(0, 0, 0, 0)'; /* disables the shadow */
	ctx.drawImage(img, 2, 2);
}

/* makes a hole with the shape of the image */
function popOut(canvas, img) {
	var shadowcolor = 0xFF3B314D;
	var backgroundcolor = 0xFF5C637E;
	canvas.width = img.width;
	canvas.height = img.height;
	var ctx = canvas.getContext('2d');
	ctx.drawImage(img, 0, 0);
	var idat = ctx.getImageData(0, 0, canvas.width, canvas.height);
	var u32dat = new Uint32Array(idat.data.buffer);
	var clr = function(x, y) {
		return (x < 0 || y < 0 || x >= idat.width || y >= idat.height) ? 0
			: u32dat[y * idat.width + x];
	};
	for(var i = u32dat.length; i--;) {
		if(u32dat[i] !== 0) {
			u32dat[i] = backgroundcolor;
		}
	}
	for(var y = idat.height; y--;) {
		for(var x = idat.width; x--;) {
			if(clr(x, y) === backgroundcolor && (!clr(x, y - 1) || !clr(x - 1, y)) && !clr(x - 1, y - 1)) {
				u32dat[y * idat.width + x] = shadowcolor;
			}
		}
	}
	for(var y = idat.height; y--;) {
		for(var x = idat.width; x--;) {
			if(clr(x, y - 1) === shadowcolor
			   && clr(x - 1, y) === shadowcolor) {
				u32dat[y * idat.width + x] = shadowcolor;
			}
		}
	}
	ctx.putImageData(idat, 0, 0);
}

function load(oncomplete) {
	cursors.set.onload = function() {
		var set = cursors.set;
		var slotcanvas = document.createElement('canvas');
		popOut(slotcanvas, set);
		var j = Object.keys(cursors).length - 1 + 1; /* +1 slotset to blob url */
		for(var tool in cursors) {
			if (tool === 'set') { continue; }
			tool = cursors[tool];
			var original = document.createElement('canvas');
			var i = tool.img = {
				shadowed: document.createElement('canvas'),
				shadowblob: null
			};
			original.width = original.height = 36;
			original.getContext('2d').drawImage(set,
				tool.imgpos[0] * 36,
				tool.imgpos[1] * 36,
				36, 36,
				0, 0,
				36, 36
			);
			reduce(original);
			shadow(i.shadowed, original);
			tool.hotspot[0] += 2;
			tool.hotspot[1] += 2; /* Check shadow() for explanation */

			/* Blob-ify images */
			i.shadowed.toBlob(function(blob) {
				this.img.shadowblob = URL.createObjectURL(blob);
				if(!--j) oncomplete();
			}.bind(tool));
		}
		slotcanvas.toBlob(blob => {
			cursors.slotset = URL.createObjectURL(blob);
			if(!--j) oncomplete();
		});
	};

	cursors.set.src = options.toolSetUrl;
}

eventSys.once(e.loaded, () => {
	load(() => eventSys.emit(e.misc.toolsRendered));
});
