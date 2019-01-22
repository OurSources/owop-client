'use strict';
import { protocol, EVENTS as e, options } from './conf.js';
import { eventSys, PublicAPI } from './global.js';
import { elements, misc } from './main.js';
import { player } from './local_player.js';
import { activeFx } from './Fx.js';
import { getTime } from './util/misc.js';
import { colorUtils as color } from './util/color.js';
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
	minGridZoom: options.minGridZoom,
	updatedClusters: [], /* Clusters to render in the next frame */
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
	patterns: {
		get unloaded() { return rendererValues.unloadedPattern; }
	},
	render: requestRender,
	showGrid: setGridVisibility,
	get gridShown() { return rendererValues.gridShown; },
	updateCamera: onCameraMove,
	unloadFarClusters: unloadFarClusters
};

PublicAPI.camera = camera;
PublicAPI.renderer = renderer;

class BufView {
	constructor(u32data, x, y, w, h, realw) {
		this.data = u32data;
		if (options.chunkBugWorkaround) {
			this.changes = [];
		}
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
		if (options.chunkBugWorkaround) {
			this.changes.push([0, x, y, data]);
		}
	}

	fill(data) {
		for (var i = 0; i < this.height; i++) {
			for (var j = 0; j < this.width; j++) {
				this.data[(this.offx + j) + (this.offy + i) * this.realwidth] = data;
			}
		}
		if (options.chunkBugWorkaround) {
			this.changes.push([1, 0, 0, data]);
		}
	}

	fillFromBuf(u32buf) {
		for (var i = 0; i < this.height; i++) {
			for (var j = 0; j < this.width; j++) {
				this.data[(this.offx + j) + (this.offy + i) * this.realwidth] = u32buf[j + i * this.width];
				if (options.chunkBugWorkaround) {
					/* Terrible */
					this.changes.push([0, j, i, u32buf[j + i * this.width]]);
				}
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
		if (options.chunkBugWorkaround) {
			this.currentColor = 0;
		}
	}

	render() {
		this.toUpdate = false;
		for (var i = this.chunks.length; i--;) {
			var c = this.chunks[i];
			if (c.needsRedraw) {
				c.needsRedraw = false;
				if (options.chunkBugWorkaround) {
					var arr = c.view.changes;
					var s = protocol.chunkSize;
					for (var j = 0; j < arr.length; j++) {
						var current = arr[j];
						if (this.currentColor !== current[3]) {
							this.currentColor = current[3];
							this.ctx.fillStyle = color.toHTML(current[3]);
						}
						switch (current[0]) {
						case 0:
							this.ctx.fillRect(c.view.offx + current[1], c.view.offy + current[2], 1, 1);
							break;
						case 1:
							this.ctx.fillRect(c.view.offx, c.view.offy, s, s);
							break;
						}
					}
					c.view.changes = [];
				} else {
					this.ctx.putImageData(this.data, 0, 0,
						c.view.offx, c.view.offy, c.view.width, c.view.height);
				}
			}
		}
	}

	remove() {
		this.removed = true;
		if (this.shown) {
			var visiblecl = rendererValues.visibleClusters;
			visiblecl.splice(visiblecl.indexOf(this), 1);
			this.shown = false;
		}
		this.canvas.width = 0;
		this.u32data = this.data = null;
		delete rendererValues.clusters[`${this.x},${this.y}`];
		for (var i = 0; i < this.chunks.length; i++) {
			this.chunks[i].view = null;
			this.chunks[i].remove();
		}
		this.chunks = [];
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
export function drawText(ctx, str, x, y, centered){
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

export function unloadFarClusters() { /* Slow? */
	var camx = camera.x;
	var camy = camera.y;
	var zoom = camera.zoom;
	var camw = window.innerWidth / zoom | 0;
	var camh = window.innerHeight / zoom | 0;
	var ctrx = camx + camw / 2;
	var ctry = camy + camh / 2;
	var s = protocol.clusterChunkAmount * protocol.chunkSize;
	for (var c in rendererValues.clusters) {
		c = rendererValues.clusters[c];
		if (!isVisible(c.x * s, c.y * s, s, s)) {
			var dx = Math.abs(ctrx / s - c.x) | 0;
			var dy = Math.abs(ctry / s - c.y) | 0;
			var dist = dx + dy; /* no sqrt please */
			//console.log(dist);
			if (dist > options.unloadDistance) {
				c.remove();
			}
		}
	}
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
		var cwidth = window.innerWidth;
		var cheight = window.innerHeight;
		var background = rendererValues.worldBackground;
		var allChunksLoaded = misc.world.allChunksLoaded();

		if (!allChunksLoaded) {
			ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		}

		ctx.lineWidth = 2.5 / 16 * zoom;

		ctx.scale(zoom, zoom);

		for (var i = 0; i < visible.length; i++) {
			var cluster = visible[i];
			var gx = -(camx - cluster.x * clusterCanvasSize);
			var gy = -(camy - cluster.y * clusterCanvasSize);
			var clipx = gx < 0 ? -gx : 0;
			var clipy = gy < 0 ? -gy : 0;
			var x = gx < 0 ? 0 : gx;
			var y = gy < 0 ? 0 : gy;
			var clipw = clusterCanvasSize - clipx;
			var cliph = clusterCanvasSize - clipy;
			clipw = clipw + x < cwidth / zoom ? clipw : cwidth / zoom - x;
			cliph = cliph + y < cheight / zoom ? cliph : cheight / zoom - y;
			clipw = (clipw + 1) | 0; /* Math.ceil */
			cliph = (cliph + 1) | 0;
			if (clipw > 0 && cliph > 0) {
				ctx.drawImage(cluster.canvas, clipx, clipy, clipw, cliph, x, y, clipw, cliph);
			}
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
			if (!allChunksLoaded) {
				ctx.globalCompositeOperation = "source-atop";
			}
			ctx.fillRect(-gx, -gy, ctx.canvas.width, ctx.canvas.height);
		}

		if (rendererValues.unloadedPattern != null && (!allChunksLoaded || background != null)) {
			ctx.fillStyle = rendererValues.unloadedPattern;
			ctx.globalCompositeOperation = "destination-over";
			ctx.fillRect(-gx, -gy, ctx.canvas.width, ctx.canvas.height);
		}

		ctx.translate(-gx, -gy);

		ctx.globalCompositeOperation = "source-over";

		for (var i = 0; i < activeFx.length; i++) {
			switch (activeFx[i].render(ctx, time)) {
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

function renderPlayer(targetPlayer, fontsize) {
	var camx = camera.x * 16;
	var camy = camera.y * 16;
	var zoom = camera.zoom;
	var ctx  = rendererValues.animContext;
	var cnvs = ctx.canvas;
	var tool = targetPlayer.tool;
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
	var size = tmpcanvas.width = tmpcanvas.height = Math.round(16 * zoom);
	ctx.setLineDash([1]);
	ctx.globalAlpha = 0.2;
	if (zoom >= 4) {
		var fadeMult = Math.min(1, zoom - 4);
		if (fadeMult < 1) {
			ctx.globalAlpha = 0.2 * fadeMult;
		}
		ctx.beginPath();
		for (var i = 16; --i;) {
			ctx.moveTo(i * zoom + .5, 0);
			ctx.lineTo(i * zoom + .5, size);
			ctx.moveTo(0, i * zoom + .5);
			ctx.lineTo(size, i * zoom + .5);
		}
		ctx.stroke();
		ctx.globalAlpha = Math.max(0.2, 1 * fadeMult);
	}
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.lineTo(0, size);
	ctx.lineTo(size, size);
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
	ctx.imageSmoothingEnabled = false;
	ctx.webkitImageSmoothingEnabled = false;
	ctx.mozImageSmoothingEnabled = false;
	ctx.msImageSmoothingEnabled = false;
	ctx.oImageSmoothingEnabled = false;
	rendererValues.currentFontSize = -1;
	onCameraMove();
}

function alignCamera() {
	var zoom = cameraValues.zoom;
	var alignedX = Math.round(cameraValues.x * zoom) / zoom;
	var alignedY = Math.round(cameraValues.y * zoom) / zoom;
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
	eventSys.emit(e.camera.moved, camera);
	alignCamera();
	updateVisible();
	if (misc.world !== null) {
		requestMissingChunks();
	}
	requestRender(renderer.rendertype.FX);
}

function getCenterPixel() {
	var x = Math.round(cameraValues.x + window.innerWidth / camera.zoom / 2);
	var y = Math.round(cameraValues.y + window.innerHeight / camera.zoom / 2);
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
	centerCameraTo(x, y);
});

eventSys.on(e.camera.zoom, z => {
	setGridZoom(z);
	/*cameraValues.lerpZoom.val = z;*/
	requestRender(renderer.rendertype.FX);
});

eventSys.on(e.renderer.addChunk, chunk => {
	var clusterX = Math.floor(chunk.x / protocol.clusterChunkAmount);
	var clusterY = Math.floor(chunk.y / protocol.clusterChunkAmount);
	var key = `${clusterX},${clusterY}`;
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
	var size = protocol.chunkSize;
	if (cluster.toUpdate || isVisible(chunk.x * size, chunk.y * size, size, size)) {
		requestRender(renderer.rendertype.WORLD | renderer.rendertype.FX);
	}
});

eventSys.on(e.renderer.rmChunk, chunk => {
	var clusterX = Math.floor(chunk.x / protocol.clusterChunkAmount);
	var clusterY = Math.floor(chunk.y / protocol.clusterChunkAmount);
	var key = `${clusterX},${clusterY}`;
	var clusters = rendererValues.clusters;
	var cluster = clusters[key];
	if (cluster) {
		cluster.delChunk(chunk);
		if (!cluster.removed && !cluster.toUpdate) {
			cluster.toUpdate = true;
			rendererValues.updatedClusters.push(cluster);
		}
	}
});

eventSys.on(e.renderer.updateChunk, chunk => {
	var clusterX = Math.floor(chunk.x / protocol.clusterChunkAmount);
	var clusterY = Math.floor(chunk.y / protocol.clusterChunkAmount);
	var key = `${clusterX},${clusterY}`;
	var cluster = rendererValues.clusters[key];
	if (cluster && !cluster.toUpdate) {
		cluster.toUpdate = true;
		rendererValues.updatedClusters.push(cluster);
	}
	var size = protocol.chunkSize;
	if (isVisible(chunk.x * size, chunk.y * size, size, size)) {
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
