'use strict';
import { protocol, EVENTS as e, options } from './conf.js';
import { eventSys, PublicAPI } from './global.js';
import { elements, misc } from './main.js';
import { player } from './local_player.js';
import { activeFx, FXTYPE } from './Fx.js';
import { getTime } from './util/misc.js';
import { Lerp } from './util/Lerp.js';
import { tools } from './tools.js';

export { centerCameraTo, moveCameraBy, moveCameraTo, isVisible };

/* oh boy, i'm going to get shit for making this private, aren't i?  */
const cameraValues = {
	x: 0,
	y: 0,
	zoom: -1/*,
	lerpZoom: new Lerp(options.defaultZoom, options.defaultZoom, 200)*/
};

export const camera = {
	get x() { return cameraValues.x; },
	get y() { return cameraValues.y; },
	get zoom() { return cameraValues.zoom; },
	/*get lerpZoom() { return cameraValues.lerpZoom.val; },*/
	set zoom(z) {
		z = Math.min(options.zoomLimitMax, Math.max(options.zoomLimitMin, z));
		if (z !== cameraValues.zoom) {
			var center = getCenterPixel();
			cameraValues.zoom = z;
			centerCameraTo(center[0], center[1]);
			eventSys.emit(e.camera.zoom, z);
		}
	},
	isVisible: isVisible
};

const rendererValues = {
	updateRequired: 3,
	animContext: null,
	gridShown: true,
	gridPattern: null, /* Rendered each time the zoom changes */
	unloadedPattern: null,
	worldBackground: null,
	minGridZoom: 4, /* minimum zoom level where the grid shows up */
	updatedClusters: [], /* Clusters to render for the next frame */
	clusters: {},
	visibleClusters: [],
	currentFontSize: -1
};

/*PublicAPI.rval = rendererValues;*/

export const renderer = {
	rendertype: {
		ALL:      0b11,
		FX:       0b01,
		WORLD:    0b10
	},
	render: requestRender,
	showGrid: setGridVisibility,
	get gridShown() { return rendererValues.gridShown; },
	updateCamera: onCameraMove
};

PublicAPI.camera = camera;
PublicAPI.renderer = renderer;

class BufView {
	constructor(u32data, x, y, w, h, realw) {
		this.data = u32data;
		this.offx = x;
		this.offy = y;
		this.realwidth = realw;
		this.width = w;
		this.height = h;
	}

	get(x, y) {
		return this.data[(this.offx + x) + (this.offy + y) * this.realwidth];
	}

	set(x, y, data) {
		this.data[(this.offx + x) + (this.offy + y) * this.realwidth] = data;
	}

	fill(data) {
		for (var i = 0; i < this.height; i++) {
			for (var j = 0; j < this.width; j++) {
				this.data[(this.offx + j) + (this.offy + i) * this.realwidth] = data;
			}
		}
	}

	fillFromBuf(u32buf) {
		for (var i = 0; i < this.height; i++) {
			for (var j = 0; j < this.width; j++) {
				this.data[(this.offx + j) + (this.offy + i) * this.realwidth] = u32buf[j + i * this.width];
			}
		}
	}
}

class ChunkCluster {
	constructor(x, y) {
		this.removed = false;
		this.toUpdate = false;
		this.shown = false; /* is in document? */
		this.x = x;
		this.y = y;
		this.canvas = document.createElement("canvas");
		this.canvas.width = protocol.chunkSize * protocol.clusterChunkAmount;
		this.canvas.height = protocol.chunkSize * protocol.clusterChunkAmount;
		this.ctx = this.canvas.getContext("2d");
		this.data = this.ctx.createImageData(this.canvas.width, this.canvas.height);
		this.u32data = new Uint32Array(this.data.data.buffer);
		this.chunks = [];
		//this.canvas.style.transform = "translate(" + (x * protocol.chunkSize * protocol.clusterChunkAmount) + "px," + (y * protocol.chunkSize * protocol.clusterChunkAmount) + "px)";
	}
	
	render() {
		this.toUpdate = false;
		for (var i = this.chunks.length; i--;) {
			var c = this.chunks[i];
			if (c.needsRedraw) {
				c.needsRedraw = false;
				this.ctx.putImageData(this.data, 0, 0,
					c.view.offx, c.view.offy, c.view.width, c.view.height);
			}
		}
	}
	
	remove() {
		this.removed = true;
		if (this.shown) {
			this.shown = false;
		}
		this.canvas.width = 0;
		this.u32data = this.data = null;
		for (var i = 0; i < this.chunks.length; i++) {
			this.chunks[i].view = null;
		}
		this.chunks = [];
		delete rendererValues.clusters[[this.x, this.y]];
	}
	
	addChunk(chunk) {
		/* WARNING: Should absMod if not power of two */
		var x = chunk.x & (protocol.clusterChunkAmount - 1);
		var y = chunk.y & (protocol.clusterChunkAmount - 1);
		var s = protocol.chunkSize;
		var view = new BufView(this.u32data, x * s, y * s, s, s, protocol.clusterChunkAmount * s);
		if (chunk.tmpChunkBuf) {
			view.fillFromBuf(chunk.tmpChunkBuf);
			chunk.tmpChunkBuf = null;
		}
		chunk.view = view;
		this.chunks.push(chunk);
		chunk.needsRedraw = true;
	}
	
	delChunk(chunk) {
		chunk.view = null;
		/* There is no real need to clearRect the chunk area */
		var i = this.chunks.indexOf(chunk);
		if (i !== -1) {
			this.chunks.splice(i, 1);
		}
		if (!this.chunks.length) {
			this.remove();
		}
	}
}

/* Draws white text with a black border */
function drawText(ctx, str, x, y, centered){
	ctx.strokeStyle = "#000000",
	ctx.fillStyle = "#FFFFFF",
	ctx.lineWidth = 2.5,
	ctx.globalAlpha = 0.5;
	if(centered) {
		x -= ctx.measureText(str).width >> 1;
	}
	ctx.strokeText(str, x, y);
	ctx.globalAlpha = 1;
	ctx.fillText(str, x, y);
}

function isVisible(x, y, w, h) {
	var cx    = camera.x;
	var cy    = camera.y;
	var czoom = camera.zoom;
	var cw    = window.innerWidth;
	var ch    = window.innerHeight;
	return x + w > cx && y + h > cy &&
	       x <= cx + cw / czoom && y <= cy + ch / czoom;
}

function render(type) {
	var time = getTime(true);
	var camx = camera.x;
	var camy = camera.y;
	var zoom = camera.zoom;
	var needsRender = 0; /* If an animation didn't finish, render again */
	
	if (type & renderer.rendertype.WORLD) {
		var uClusters = rendererValues.updatedClusters;
		for (var i = 0; i < uClusters.length; i++) {
			var c = uClusters[i];
			c.render();
		}
		rendererValues.updatedClusters = [];
	}
	
	if (type & renderer.rendertype.FX && misc.world !== null) {
		var ctx = rendererValues.animContext;
		var visible = rendererValues.visibleClusters;
		var clusterCanvasSize = protocol.chunkSize * protocol.clusterChunkAmount;
		var modx = Math.ceil(window.innerWidth / clusterCanvasSize);
		var mody = Math.ceil(window.innerHeight / clusterCanvasSize);
		var background = rendererValues.worldBackground;
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		ctx.lineWidth = 2.5 / 16 * zoom;

		ctx.scale(zoom, zoom);

		for (var i = 0; i < visible.length; i++) {
			var cluster = visible[i];
			var gx = -(camx - cluster.x * clusterCanvasSize) % (modx * clusterCanvasSize);
			var gy = -(camy - cluster.y * clusterCanvasSize) % (mody * clusterCanvasSize);
			ctx.drawImage(cluster.canvas, gx, gy);
		}

		ctx.scale(1 / zoom, 1 / zoom); /* probably faster than ctx.save(), ctx.restore() */
		
		if (background != null) {
			var newscale = zoom / options.defaultZoom;
			var oldscale = options.defaultZoom / zoom;
			var gx = -(camx * zoom) % (background.width * newscale);
			var gy = -(camy * zoom) % (background.height * newscale);
			ctx.translate(gx, gy);

			ctx.fillStyle = background;
			ctx.globalCompositeOperation = "destination-over";
			
			ctx.scale(newscale, newscale);
			ctx.fillRect(-gx / newscale, -gy / newscale, ctx.canvas.width * oldscale, ctx.canvas.height * oldscale);
			ctx.scale(oldscale, oldscale);

			ctx.translate(-gx, -gy);
		}

		var gx = -(camx * zoom) % (16 * zoom);
		var gy = -(camy * zoom) % (16 * zoom);
		ctx.translate(gx, gy);

		if (rendererValues.gridShown && rendererValues.gridPattern) {
			ctx.fillStyle = rendererValues.gridPattern;
			ctx.globalCompositeOperation = "source-atop";
			ctx.fillRect(-gx, -gy, ctx.canvas.width, ctx.canvas.height);
		}

		if (rendererValues.unloadedPattern != null && (!misc.world.allChunksLoaded() || background != null)) {
			ctx.fillStyle = rendererValues.unloadedPattern;
			ctx.globalCompositeOperation = "destination-over";
			ctx.fillRect(-gx, -gy, ctx.canvas.width, ctx.canvas.height);
		}

		ctx.translate(-gx, -gy);

		ctx.globalCompositeOperation = "source-over";

		for (var i = 0; i < activeFx.length; i++) {
			switch (renderFx(activeFx[i], time)) {
			case 0: /* Anim not finished */
				needsRender |= renderer.rendertype.FX;
				break;
			case 2: /* Obj deleted from array, prevent flickering */
				--i;
				break;
			}
		}
		ctx.globalAlpha = 1;
		var players = misc.world.players;
		var fontsize = 10 / 16 * zoom | 0;
		if (rendererValues.currentFontSize != fontsize) {
			ctx.font = fontsize + "px sans-serif";
			rendererValues.currentFontSize = fontsize;
		}
		for (var p in players) {
			var player = players[p];
			if (!renderPlayer(player, fontsize)) {
				needsRender |= renderer.rendertype.FX;
			}
		}
	}

	requestRender(needsRender);
}

function renderFx(fx, time) { /* Move this to Fx proto maybe */
	var camx = camera.x;
	var camy = camera.y;
	var context = rendererValues.animContext;
	var cnvs = context.canvas;
	var zoom = camera.zoom;
	var fl = Math.floor;

	var fxx = fl(fx.x * zoom) - camx * zoom;
	var fxy = fl(fx.y * zoom) - camy * zoom;

	if ((fxx < -zoom || fxy < -zoom
	|| fxx > cnvs.width || fxy > cnvs.height) && fx.type != 3) {
		return 1; /* 1 = Finished rendering */
	}

	switch (fx.type) {
	case FXTYPE.PIXEL_SELECT: /* Only used for the local client */
		context.globalAlpha = 0.8;
		context.strokeStyle = fx.options.colorhex;
		context.strokeRect(fxx, fxy, zoom, zoom);
		break;

	case FXTYPE.PIXEL_UPDATE:
		var alpha = 1 - (time - fx.options.time) / 1000;
		if (alpha <= 0) {
			fx.delete();
			return 2; /* 2 = An FX object was deleted */
		}
		context.globalAlpha = alpha;
		context.strokeStyle = fx.options.colorhex;
		context.strokeRect(fxx, fxy, zoom, zoom);
		return 0; /* 0 = Animation not finished */
		break;

	case FXTYPE.CHUNK_UPDATE:
		var alpha = 1 - (time - fx.options.time) / 1000;
		if (alpha <= 0) {
			fx.delete();
			return 2;
			break;
		}
		context.globalAlpha = alpha;
		context.strokeStyle = fx.options.colorhex;
		context.strokeRect((fl(fx.x / 16) * 16 - camx) * zoom,
		                   (fl(fx.y / 16) * 16 - camy) * zoom,
		                   zoom * 16, zoom * 16);
		return 0;
		break;
	}
	return 1;
}

function renderPlayer(targetPlayer, fontsize) {
	var camx = camera.x * 16;
	var camy = camera.y * 16;
	var zoom = camera.zoom;
	var ctx  = rendererValues.animContext;
	var cnvs = ctx.canvas;
	var tool = tools[targetPlayer.tool];
	if (!tool) {
		/* Render the default tool if the selected one isn't defined */
		tool = tools['cursor'];
	}
	var toolwidth = tool.cursor.width / 16 * zoom;
	var toolheight = tool.cursor.height / 16 * zoom;

	var x = targetPlayer.x;
	var y = targetPlayer.y;
	var cx = ((x - camx) - tool.offset[0]) * (zoom / 16) | 0;
	var cy = ((y - camy) - tool.offset[1]) * (zoom / 16) | 0;

	if(cx < -toolwidth || cy < -toolheight
	|| cx > cnvs.width || cy > cnvs.height) {
		return true;
	}

	
	if (fontsize > 3) {
		var idstr = targetPlayer.id;
		var textw = ctx.measureText(idstr).width + (zoom / 2);
		
		ctx.globalAlpha = 1;
		ctx.fillStyle = targetPlayer.clr;
		ctx.fillRect(cx, cy + toolheight, textw, zoom);
		ctx.globalAlpha = 0.2;
		ctx.lineWidth = 3;
		ctx.strokeStyle = "#000000";
		ctx.strokeRect(cx, cy + toolheight, textw, zoom);
		ctx.globalAlpha = 1;
		drawText(ctx, idstr, cx + zoom / 4, cy + fontsize + toolheight + zoom / 8);
	}

	ctx.drawImage(tool.cursor, cx, cy, toolwidth, toolheight);

	return x === targetPlayer.endX && y === targetPlayer.endY;
}

function requestRender(type) {
	rendererValues.updateRequired |= type;
}

function setGridVisibility(enabled) {
	rendererValues.gridShown = enabled;
	requestRender(renderer.rendertype.FX);
}

function renderGrid(zoom) {
	var tmpcanvas = document.createElement("canvas");
	var ctx = tmpcanvas.getContext("2d");
	tmpcanvas.width = tmpcanvas.height = 16 * zoom;
	ctx.setLineDash([1]);
	if (zoom >= 4) {
		ctx.globalAlpha = .2;
		for (var i = 16; --i;) {
			ctx.beginPath();
			ctx.moveTo(i * zoom + .5, 0);
			ctx.lineTo(i * zoom + .5, 16 * zoom);
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(0, i * zoom + .5);
			ctx.lineTo(16 * zoom, i * zoom + .5);
			ctx.stroke();
		}
		ctx.globalAlpha = 1;
	}
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.lineTo(0, 16 * zoom);
	ctx.lineTo(16 * zoom, 16 * zoom);
	ctx.stroke();
	return ctx.createPattern(tmpcanvas, "repeat");
}

function setGridZoom(zoom) {
	if (zoom >= rendererValues.minGridZoom) {
		rendererValues.gridPattern = renderGrid(zoom);
	} else {
		rendererValues.gridPattern = null;
	}
}

function updateVisible() {
	var clusters = rendererValues.clusters;
	var visiblecl = rendererValues.visibleClusters;
	for (var c in clusters) {
		c = clusters[c];
		var size = protocol.chunkSize * protocol.clusterChunkAmount;
		var visible = isVisible(c.x * size, c.y * size, size, size);
		if (!visible && c.shown) {
			c.shown = false;
			visiblecl.splice(visiblecl.indexOf(c), 1);
		} else if (visible && !c.shown) {
			c.shown = true;
			visiblecl.push(c);
			requestRender(renderer.rendertype.WORLD);
		}
	}
};

function onResize() {
	elements.animCanvas.width = window.innerWidth;
	elements.animCanvas.height = window.innerHeight;
	var ctx = rendererValues.animContext;
	ctx.imageSmoothingEnabled       = false;
	ctx.webkitImageSmoothingEnabled = false;
	ctx.mozImageSmoothingEnabled    = false;
	ctx.msImageSmoothingEnabled     = false;
	ctx.oImageSmoothingEnabled      = false;
	rendererValues.currentFontSize = -1;
	onCameraMove();
}

function alignCamera() {
	var zoom = cameraValues.zoom;
	var alignedX = (cameraValues.x * zoom | 0) / zoom;
	var alignedY = (cameraValues.y * zoom | 0) / zoom;
	cameraValues.x = alignedX;
	cameraValues.y = alignedY;
}

function requestMissingChunks() { /* TODO: move this to World */
	var x = camera.x / protocol.chunkSize - 2 | 0;
	var mx = camera.x / protocol.chunkSize + window.innerWidth / camera.zoom / protocol.chunkSize | 0;
	var cy = camera.y / protocol.chunkSize - 2 | 0;
	var my = camera.y / protocol.chunkSize + window.innerHeight / camera.zoom / protocol.chunkSize | 0;
	while (++x <= mx) {
		var y = cy;
		while (++y <= my) {
			misc.world.loadChunk(x, y);
		}
	}
}

function onCameraMove() {
	alignCamera();
	updateVisible();
	if (misc.world !== null) {
		requestMissingChunks();
	}
	requestRender(renderer.rendertype.FX);
}

function getCenterPixel() {
	var x = Math.ceil(cameraValues.x + window.innerWidth / camera.zoom / 2);
	var y = Math.ceil(cameraValues.y + window.innerHeight / camera.zoom / 2);
	return [x, y];
}

function centerCameraTo(x, y) {
	cameraValues.x = -(window.innerWidth / camera.zoom / 2) + x;
	cameraValues.y = -(window.innerHeight / camera.zoom / 2) + y;
	onCameraMove();
}

function moveCameraBy(x, y) {
	cameraValues.x += x;
	cameraValues.y += y;
	onCameraMove();
}

function moveCameraTo(x, y) {
	cameraValues.x = x;
	cameraValues.y = y;
	onCameraMove();
}

eventSys.on(e.net.world.teleported, (x, y) => {
	moveCameraTo(x, y);
});

eventSys.on(e.camera.zoom, z => {
	setGridZoom(z);
	/*cameraValues.lerpZoom.val = z;*/
	requestRender(renderer.rendertype.FX);
});

eventSys.on(e.renderer.addChunk, chunk => {
	var clusterX = Math.floor(chunk.x / protocol.clusterChunkAmount);
	var clusterY = Math.floor(chunk.y / protocol.clusterChunkAmount);
	var key = [clusterX, clusterY].join();
	var clusters = rendererValues.clusters;
	var cluster = clusters[key];
	if (!cluster) {
		cluster = clusters[key] = new ChunkCluster(clusterX, clusterY);
		updateVisible();
	}
	cluster.addChunk(chunk);
	if (!cluster.toUpdate) {
		cluster.toUpdate = true;
		rendererValues.updatedClusters.push(cluster);
	}
	requestRender(renderer.rendertype.WORLD | renderer.rendertype.FX);	
});

eventSys.on(e.renderer.rmChunk, chunk => {
	var clusterX = Math.floor(chunk.x / protocol.clusterChunkAmount);
	var clusterY = Math.floor(chunk.y / protocol.clusterChunkAmount);
	var key = [clusterX, clusterY].join();
	var clusters = rendererValues.clusters;
	var cluster = clusters[key];
	if (cluster) {
		cluster.delChunk(chunk);
		if (!cluster.removed) {
			rendererValues.updatedClusters.push(cluster);
		}
	}
});

eventSys.on(e.renderer.updateChunk, chunk => {
	var clusterX = Math.floor(chunk.x / protocol.clusterChunkAmount);
	var clusterY = Math.floor(chunk.y / protocol.clusterChunkAmount);
	var key = [clusterX, clusterY].join();
	var cluster = rendererValues.clusters[key];
	if (cluster && !cluster.toUpdate) {
		cluster.toUpdate = true;
		rendererValues.updatedClusters.push(cluster);
	}
	if (isVisible(chunk.x * protocol.chunkSize, chunk.y * protocol.chunkSize, protocol.chunkSize, protocol.chunkSize)) {
		requestRender(renderer.rendertype.WORLD | renderer.rendertype.FX);
	}
});

eventSys.on(e.misc.worldInitialized, () => {
	requestMissingChunks();
});

eventSys.once(e.init, () => {
	rendererValues.animContext = elements.animCanvas.getContext("2d", { alpha: false });
	window.addEventListener("resize", onResize);
	onResize();
	camera.zoom = options.defaultZoom;
	centerCameraTo(0, 0);

	const mkPatternFromUrl = (url, cb) => {
		var patImg = new Image();
		patImg.onload = () => {
			var pat = rendererValues.animContext.createPattern(patImg, "repeat");
			pat.width = patImg.width;
			pat.height = patImg.height;
			cb(pat);
		};
		patImg.src = url;
	};

	/* Create the pattern images */
	mkPatternFromUrl(options.unloadedPatternUrl, pat => {
		rendererValues.unloadedPattern = pat;
	});

	if (options.backgroundUrl != null) {
		mkPatternFromUrl(options.backgroundUrl, pat => {
			rendererValues.worldBackground = pat;
		});
	}

	function frameLoop() {
		let type;
		if ((type = rendererValues.updateRequired) !== 0) {
			rendererValues.updateRequired = 0;
			render(type);
		}
		window.requestAnimationFrame(frameLoop);
	}
	eventSys.once(e.misc.toolsInitialized, frameLoop);
});
