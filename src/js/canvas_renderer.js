'use strict';
import { protocol, EVENTS as e, options } from './conf.js';
import { eventSys, PublicAPI } from './global.js';
import { elements, misc } from './main.js';
import { player } from './local_player.js';
import { activeFx, FXTYPE } from './Fx.js';
import { getTime } from './util/misc.js';
import { Lerp } from './util/Lerp.js';

export { centerCameraTo, moveCameraBy, moveCameraTo };

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
	minGridZoom: 4, /* minimum zoom level where the grid shows up */
	updatedClusters: [], /* Clusters to render for the next frame */
	clusters: {}
};

// PublicAPI.rval = rendererValues;

export const renderer = {
	rendertype: {
		ALL:      0b111,
		FX:       0b001,
		WORLD:    0b010,
		VIEWPORT: 0b100
	},
	render: requestRender,
	showGrid: setGridVisibility,
	get gridShown() { return rendererValues.gridShown; },
	updateCamera: onCameraMove
};

PublicAPI.camera = camera;
PublicAPI.renderer = renderer;

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
		this.chunks = [];
		this.canvas.style.transform = "translate(" + (x * protocol.chunkSize * protocol.clusterChunkAmount) + "px," + (y * protocol.chunkSize * protocol.clusterChunkAmount) + "px)";
	}
	
	render() {
		this.toUpdate = false;
		var offx = this.x * protocol.clusterChunkAmount;
		var offy = this.y * protocol.clusterChunkAmount;
		for (var i = this.chunks.length; i--;) {
			var c = this.chunks[i];
			if (c.needsRedraw) {
				c.needsRedraw = false;
				this.ctx.putImageData(c.data, (c.x - offx) * protocol.chunkSize, (c.y - offy) * protocol.chunkSize);
			}
		}
	}
	
	remove() {
		this.removed = true;
		if (this.shown) {
			this.shown = false;
		}
		this.canvas.width = 0;
		this.chunks = [];
		this.canvas.remove();
		delete rendererValues.clusters[[this.x, this.y]];
	}
	
	addChunk(chunk) {
		this.chunks.push(chunk);
		var offx = this.x * protocol.clusterChunkAmount;
		var offy = this.y * protocol.clusterChunkAmount;
		this.ctx.putImageData(chunk.data, (chunk.x - offx) * protocol.chunkSize, (chunk.y - offy) * protocol.chunkSize);
	}
	
	delChunk(chunk) {
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
	return x + w >= cx && y + h >= cy &&
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
	
	if (type & renderer.rendertype.FX) {
		var ctx = rendererValues.animContext;
		ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
		ctx.lineWidth = 2.5 / 16 * zoom;
		
		if (rendererValues.gridShown && rendererValues.gridPattern) {
			var gx = -(camx * zoom) % (16 * zoom);
			var gy = -(camy * zoom) % (16 * zoom);
			ctx.translate(gx, gy);
			ctx.fillStyle = rendererValues.gridPattern;
			ctx.fillRect(-gx, -gy, ctx.canvas.width, ctx.canvas.height);
			ctx.translate(-gx, -gy);
		}

		if (misc.world !== null) {
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
			for (var p in players) {
				if (!players[p].render()) {
					needsRender |= renderer.rendertype.FX;
				}
			}
		}
	}

	if (type & renderer.rendertype.VIEWPORT) {
		elements.clusterDiv.style.transform = "scale(" + zoom + ") translate(" + (-camera.x) + "px," + (-camera.y) + "px)";
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
			break;
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

function renderPlayer(targetPlayer) {
	var camx = camera.x * 16;
	var camy = camera.y * 16;
	var zoom = camera.zoom;
	var ctx  = rendererValues.animContext;
	var cnvs = ctx.canvas;
	var tool = targetPlayer.tool;
	if (!tool) {
		/* Render the default tool if the selected one isn't defined */
		tool = player.tools[0];
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

	var fontsize = 10 / 16 * zoom | 0;
	if (fontsize > 3) {
		var idstr = targetPlayer.id;
		var textw = ctx.measureText(idstr).width + (zoom / 2);
		
		ctx.font = fontsize + "px sans-serif";
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
	return x === player.endX && y === player.endY;
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
	var clusterDiv = elements.clusterDiv;
	for (var c in clusters) {
		c = clusters[c];
		var visible = isVisible(c.x * protocol.chunkSize * protocol.clusterChunkAmount, c.y * protocol.chunkSize * protocol.clusterChunkAmount, protocol.chunkSize * protocol.clusterChunkAmount, protocol.chunkSize * protocol.clusterChunkAmount);
		if (!visible && c.shown) {
			c.shown = false;
			clusterDiv.removeChild(c.canvas);
		} else if (visible && !c.shown) {
			c.shown = true;
			clusterDiv.appendChild(c.canvas);
			requestRender(renderer.rendertype.WORLD);
		}
	}
};

function onResize() {
	elements.animCanvas.width = window.innerWidth;
	elements.animCanvas.height = window.innerHeight;
	rendererValues.animContext.imageSmoothingEnabled = false;
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
	requestRender(renderer.rendertype.FX | renderer.rendertype.VIEWPORT);
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

eventSys.on(e.camera.zoom, z => {
	setGridZoom(z);
	/*cameraValues.lerpZoom.val = z;*/
	requestRender(renderer.rendertype.VIEWPORT | (rendererValues.gridShown ? renderer.rendertype.FX : 0));
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
			requestRender(renderer.rendertype.WORLD);
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
		requestRender(renderer.rendertype.WORLD);
	}
});

eventSys.on(e.misc.worldInitialized, () => {
	requestMissingChunks();
});

eventSys.once(e.init, () => {
	rendererValues.animContext = elements.animCanvas.getContext("2d");
	window.addEventListener("resize", onResize);
	onResize();
	camera.zoom = options.defaultZoom;
	centerCameraTo(0, 0);
	function frameLoop() {
		let type;
		if ((type = rendererValues.updateRequired) !== 0) {
			rendererValues.updateRequired = 0;
			render(type);
		}
		window.requestAnimationFrame(frameLoop);
	}
	frameLoop();
});
