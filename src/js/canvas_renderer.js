'use strict';
import { protocol, EVENTS as e, options } from './conf.js';
import { eventSys, PublicAPI } from './global.js';
import { elements, misc } from './main.js';
import { net } from './networking.js';
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
			setImageSmoothing(rendererValues.animContext, !shouldPixelate());
			centerCameraTo(center[0], center[1]);
			eventSys.emit(e.camera.zoom, z);
		}
	},
	isVisible: isVisible,

	centerCameraTo: centerCameraTo,
	moveCameraBy: moveCameraBy,
	moveCameraTo: moveCameraTo,
	alignCamera: alignCamera,
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
	currentFontSize: -1,
	lastPixelRatio: window.devicePixelRatio || 1,
};

PublicAPI.rendererValues = rendererValues;
PublicAPI.Lerp = Lerp;

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
	unloadFarClusters: unloadFarClusters,

	drawText: drawText,
	renderPlayer: renderPlayer,
	renderPlayerId: renderPlayerId,
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
		/* Copy a row at a time - TypedArray.set is a memcpy, so this replaces
		   width*height individual element writes with height bulk copies. */
		if (u32buf.subarray) {
			for (var i = 0; i < this.height; i++) {
				this.data.set(u32buf.subarray(i * this.width, (i + 1) * this.width),
					this.offx + (this.offy + i) * this.realwidth);
			}
			return;
		}
		/* plain arrays have no subarray, fall back to the element-wise path */
		for (var i = 0; i < this.height; i++) {
			for (var j = 0; j < this.width; j++) {
				this.data[(this.offx + j) + (this.offy + i) * this.realwidth] = u32buf[j + i * this.width];
			}
		}
	}
}

/* How many dirty chunks in one cluster before a single full-cluster upload is cheaper
   than one dirty-rect upload per chunk. A cluster holds clusterChunkAmount^2 chunks,
   so this trades a fixed 1024x1024 upload against this many small ones. */
const fullClusterRedrawThreshold = 64;

/* Regions whose coarse preview has already been asked for. Entries are dropped when the
   cluster holding them goes away, since the preview pixels die with its canvas. */
const lodRequested = new Set();
/* Regions per cluster axis: a cluster is clusterChunkAmount chunks wide, a region 16. */
const regionsPerCluster = 4;
/* Above this many visible chunks, fetch coarse region previews before full detail. */
const lodChunkThreshold = 2048;

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
		this.lodDirty = false; /* coarse preview painted, needs a full upload */
	}

	render() {
		this.toUpdate = false;
		var dirty = 0;
		for (var i = this.chunks.length; i--;) {
			if (this.chunks[i].needsRedraw) dirty++;
		}
		/* A coarse preview paints straight into the cluster buffer without belonging to
		   any Chunk, so it can only be flushed as a whole-cluster upload. */
		if (this.lodDirty) {
			this.lodDirty = false;
			for (var i = this.chunks.length; i--;) {
				this.chunks[i].needsRedraw = false;
			}
			this.ctx.putImageData(this.data, 0, 0);
			return;
		}
		if (dirty === 0) {
			return;
		}
		/* putImageData costs mostly per call, not per pixel, so once enough chunks in
		   this cluster changed - the normal case right after a batched load - a single
		   upload of the whole cluster beats one small dirty-rect upload each. */
		if (dirty >= fullClusterRedrawThreshold) {
			for (var i = this.chunks.length; i--;) {
				this.chunks[i].needsRedraw = false;
			}
			this.ctx.putImageData(this.data, 0, 0);
			return;
		}
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
		/* The coarse preview lived in this canvas, so forget it was ever fetched. */
		for (var ry = this.y * regionsPerCluster; ry < (this.y + 1) * regionsPerCluster; ry++) {
			for (var rx = this.x * regionsPerCluster; rx < (this.x + 1) * regionsPerCluster; rx++) {
				lodRequested.delete(`${rx},${ry}`);
			}
		}
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
	if(document.visibilityState === "hidden" && performance.now() > 3000) return;
	var cx    = camera.x;
	var cy    = camera.y;
	var czoom = camera.zoom;
	var cw    = document.body.clientWidth || window.innerWidth;
	var ch    = document.body.clientHeight || window.innerHeight;
	return x + w > cx && y + h > cy &&
	       x <= cx + cw / czoom && y <= cy + ch / czoom;
}

function shouldPixelate() {
	if (camera.zoom * window.devicePixelRatio < 2 && window.devicePixelRatio != 1) {
		return false;
	}
	return true;
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
		var cwidth = document.body.clientWidth || window.innerWidth;
		var cheight = document.body.clientHeight || window.innerHeight;
		var background = rendererValues.worldBackground;
		var allChunksLoaded = misc.world.allChunksLoaded();

		var bggx = -(camx * zoom) % (16 * zoom);
		var bggy = -(camy * zoom) % (16 * zoom);

		if (!allChunksLoaded) {
			if (rendererValues.unloadedPattern == null) {
				ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
			} else {
				let scale = window.devicePixelRatio || 1;
				ctx.scale(1 / scale, 1 / scale);
				ctx.translate(bggx, bggy);
				ctx.fillStyle = rendererValues.unloadedPattern;
				ctx.fillRect(-bggx, -bggy, ctx.canvas.width, ctx.canvas.height);
				ctx.translate(-bggx, -bggy);
				ctx.scale(scale, scale);
			}
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
			//clipw = (clipw + 1) | 0; /* Math.ceil */
			//cliph = (cliph + 1) | 0;
			if (clipw > 0 && cliph > 0) {
				ctx.drawImage(cluster.canvas, clipx, clipy, clipw, cliph, x, y, clipw, cliph);
			}
		}

		ctx.scale(1 / zoom, 1 / zoom); /* probably faster than ctx.save(), ctx.restore() */

		/*if (background != null) {
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
		}*/

		if (rendererValues.gridShown && rendererValues.gridPattern) {
			let scale = window.devicePixelRatio || 1;
			let roundErrCorr = (16 * zoom * scale) / Math.round(16 * zoom * scale);

			ctx.translate(bggx, bggy);
			ctx.scale(1 / scale, 1 / scale);
			ctx.scale(roundErrCorr, roundErrCorr);
			ctx.fillStyle = rendererValues.gridPattern;
			/*if (!allChunksLoaded) {
				ctx.globalCompositeOperation = "source-atop";
			}*/
			setImageSmoothing(ctx, true);
			ctx.fillRect(-bggx * scale, -bggy * scale, ctx.canvas.width, ctx.canvas.height);
			setImageSmoothing(ctx, !shouldPixelate());
			ctx.scale(1 / roundErrCorr, 1 / roundErrCorr);
			ctx.scale(scale, scale);
			ctx.translate(-bggx, -bggy);
		}


		//ctx.globalCompositeOperation = "source-over";

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

		if (options.showPlayers) {
			for (var p in players) {
				var player = players[p];
				if (!renderPlayer(player, fontsize)) {
					needsRender |= renderer.rendertype.FX;
				}
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
		renderPlayerId(ctx, fontsize, zoom, cx, cy + toolheight, targetPlayer.id, targetPlayer.clr);
	}

	ctx.drawImage(tool.cursor, cx, cy, toolwidth, toolheight);

	return x === targetPlayer.endX && y === targetPlayer.endY;
}

function renderPlayerId(ctx, fontsize, zoom, x, y, id, color) {
	var idstr = id;
	var textw = ctx.measureText(idstr).width + (zoom / 2);

	ctx.globalAlpha = 1;
	ctx.fillStyle = color;
	ctx.fillRect(x, y, textw, zoom);
	ctx.globalAlpha = 0.2;
	ctx.lineWidth = 3;
	ctx.strokeStyle = "#000000";
	ctx.strokeRect(x, y, textw, zoom);
	ctx.globalAlpha = 1;
	drawText(ctx, idstr, x + zoom / 4, y + fontsize + zoom / 8);
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
	var scale = window.devicePixelRatio || 1;
	var size = tmpcanvas.width = tmpcanvas.height = Math.round(16 * zoom * scale);

	ctx.scale(scale, scale);

	var gridSize = 1;
	// ensure the grid isn't too thick when zoomed out
	if (zoom < 7 && scale > 1) {
		gridSize = 0.5;
	}

	ctx.setLineDash([gridSize]);
	ctx.lineWidth = gridSize;
	ctx.globalAlpha = 0.2;
	if (zoom >= 4) {
		var fadeMult = Math.min(1, zoom - 4);
		if (fadeMult < 1) {
			ctx.globalAlpha = 0.2 * fadeMult;
		}
		ctx.beginPath();
		for (var i = 16; --i;) {
			ctx.moveTo(i * zoom + .5, 0);
			ctx.lineTo(i * zoom + .5, size / scale);
			ctx.moveTo(0, i * zoom + .5);
			ctx.lineTo(size / scale, i * zoom + .5);
		}
		ctx.stroke();
		ctx.globalAlpha = Math.max(0.2, 1 * fadeMult);
	}
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.lineTo(0, size / scale);
	ctx.moveTo(0, 0);
	ctx.lineTo(size / scale, 0);
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

function setImageSmoothing(ctx, state) {
	ctx.imageSmoothingEnabled = state;
	ctx.webkitImageSmoothingEnabled = state;
	ctx.mozImageSmoothingEnabled = state;
	ctx.msImageSmoothingEnabled = state;
	ctx.oImageSmoothingEnabled = state;
}

function onResize() {
	let scale = window.devicePixelRatio;
	let width = document.body.clientWidth || window.innerWidth;
	let height = document.body.clientHeight || window.innerHeight;

	elements.animCanvas.width = Math.round(width * scale);
	elements.animCanvas.height = Math.round(height * scale);
	elements.animCanvas.style.width = width + "px";
	elements.animCanvas.style.height = height + "px";

	var ctx = rendererValues.animContext;
	setImageSmoothing(ctx, !shouldPixelate());

	ctx.setTransform(scale, 0, 0, scale, 0, 0);
	rendererValues.currentFontSize = -1;

	if (rendererValues.lastPixelRatio != scale) {
		setGridZoom(camera.zoom);
		rendererValues.lastPixelRatio = scale;
	}

	onCameraMove();
}

function onVisibilityChange() {
	onCameraMove();
}

function alignCamera() {
	var zoom = cameraValues.zoom;
	var alignedX = Math.round(cameraValues.x * zoom) / zoom;
	var alignedY = Math.round(cameraValues.y * zoom) / zoom;
	cameraValues.x = alignedX;
	cameraValues.y = alignedY;
}

/* Last chunk rect we scanned, so an unchanged view can skip the whole scan.
   rescanAfter bounds how stale that decision can get, since chunks can go missing
   without the camera moving (unloaded, or an expired request). */
const lastScan = { x: 0, mx: 0, y: 0, my: 0, time: 0, valid: false };
const rescanAfter = 1000;

/* Throttle for unloadFarChunks - see onCameraMove. */
let lastUnload = 0;
const unloadInterval = 2000;

/* Paints a region's coarse preview - one averaged colour per chunk - straight into the
   cluster canvas. Chunks already held at full detail are left alone, and real chunks
   arriving later simply overwrite these pixels. `rgb` is 768 bytes, one RGB triplet per
   chunk in chunk-location order. */
export function applyRegionLod(regionX, regionY, rgb) {
	if (misc.world === null) {
		return;
	}
	var chunkSize = protocol.chunkSize;
	var clusterChunks = protocol.clusterChunkAmount;
	var regionChunks = clusterChunks / regionsPerCluster; /* 16 */
	var baseChunkX = regionX * regionChunks;
	var baseChunkY = regionY * regionChunks;
	/* A region never straddles two clusters, since regionChunks divides clusterChunks */
	var clusterX = Math.floor(baseChunkX / clusterChunks);
	var clusterY = Math.floor(baseChunkY / clusterChunks);
	var key = `${clusterX},${clusterY}`;
	var clusters = rendererValues.clusters;
	var cluster = clusters[key];
	if (!cluster) {
		cluster = clusters[key] = new ChunkCluster(clusterX, clusterY);
		updateVisible();
	}
	var data = cluster.u32data;
	var realWidth = clusterChunks * chunkSize;
	var originX = (baseChunkX - clusterX * clusterChunks) * chunkSize;
	var originY = (baseChunkY - clusterY * clusterChunks) * chunkSize;
	var worldChunks = misc.world.chunks;
	var painted = 0;
	for (var ly = 0; ly < regionChunks; ly++) {
		for (var lx = 0; lx < regionChunks; lx++) {
			if (worldChunks[`${baseChunkX + lx},${baseChunkY + ly}`]) {
				continue; /* real detail already here, don't coarsen it */
			}
			var o = (ly * regionChunks + lx) * 3;
			var color = 0xFF000000 | rgb[o + 2] << 16 | rgb[o + 1] << 8 | rgb[o];
			var px = originX + lx * chunkSize;
			var py = originY + ly * chunkSize;
			for (var row = 0; row < chunkSize; row++) {
				var start = px + (py + row) * realWidth;
				data.fill(color, start, start + chunkSize);
			}
			painted++;
		}
	}
	if (!painted) {
		return;
	}
	cluster.lodDirty = true;
	if (!cluster.toUpdate) {
		cluster.toUpdate = true;
		rendererValues.updatedClusters.push(cluster);
	}
	requestRender(renderer.rendertype.WORLD | renderer.rendertype.FX);
}

/* Asks for coarse previews covering the visible area, but only for regions not already
   fetched. While panning that is normally just the strip coming into view. */
function requestVisibleLod(x0, y0, x1, y1) {
	var regionChunks = protocol.clusterChunkAmount / regionsPerCluster;
	var r0x = Math.floor(x0 / regionChunks);
	var r1x = Math.floor(x1 / regionChunks);
	var r0y = Math.floor(y0 / regionChunks);
	var r1y = Math.floor(y1 / regionChunks);
	var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (var ry = r0y; ry <= r1y; ry++) {
		for (var rx = r0x; rx <= r1x; rx++) {
			if (lodRequested.has(`${rx},${ry}`)) {
				continue;
			}
			if (rx < minX) minX = rx;
			if (rx > maxX) maxX = rx;
			if (ry < minY) minY = ry;
			if (ry > maxY) maxY = ry;
		}
	}
	if (minX > maxX) {
		return;
	}
	for (var ry2 = minY; ry2 <= maxY; ry2++) {
		for (var rx2 = minX; rx2 <= maxX; rx2++) {
			lodRequested.add(`${rx2},${ry2}`);
		}
	}
	net.protocol.requestRegionLod(minX, minY, maxX - minX + 1, maxY - minY + 1);
}

function requestMissingChunks() { /* TODO: move this to World */
	var x = camera.x / protocol.chunkSize - 2 | 0;
	var mx = camera.x / protocol.chunkSize + window.innerWidth / camera.zoom / protocol.chunkSize | 0;
	var cy = camera.y / protocol.chunkSize - 2 | 0;
	var my = camera.y / protocol.chunkSize + window.innerHeight / camera.zoom / protocol.chunkSize | 0;
	/* This is called from onCameraMove, so it runs on every mousemove while dragging.
	   The visible chunk rect is usually identical to last time, and rescanning it
	   allocates a coordinate array plus a string key per visible chunk to reach the
	   same conclusion - which at low zoom is tens of thousands of allocations a frame. */
	var now = Date.now();
	if (lastScan.valid && lastScan.x === x && lastScan.mx === mx
		&& lastScan.y === cy && lastScan.my === my && now - lastScan.time < rescanAfter) {
		return;
	}
	lastScan.x = x;
	lastScan.mx = mx;
	lastScan.y = cy;
	lastScan.my = my;
	lastScan.time = now;
	lastScan.valid = true;
	/* Gather the visible rect and ask for it in one go - one packet for the screen
	   instead of one per chunk, which matters a lot when zoomed out.
	   Chunks are collected in expanding rings around the middle of the view so the
	   area being looked at is requested first. That ordering is what the in-flight cap
	   in requestChunks relies on: when a view is too large to request at once, the part
	   nearest the centre is the part that gets sent. */
	var x0 = x + 1, y0 = cy + 1;
	if (x0 > mx || y0 > my) {
		return;
	}
	/* Too many chunks to fetch at full detail promptly, so get a coarse pass first.
	   It costs 768 bytes per region against roughly 200KB of chunks, which is what
	   makes a zoomed-out view appear at all quickly. */
	if ((mx - x0 + 1) * (my - y0 + 1) > lodChunkThreshold && net.isConnected()) {
		requestVisibleLod(x0, y0, mx, my);
	}
	var midX = (x0 + mx) >> 1;
	var midY = (y0 + my) >> 1;
	var maxRing = Math.max(midX - x0, mx - midX, midY - y0, my - midY);
	var coords = [];
	var push = (cx2, cy2) => {
		if (cx2 >= x0 && cx2 <= mx && cy2 >= y0 && cy2 <= my) {
			coords.push(cx2, cy2);
		}
	};
	push(midX, midY);
	for (var r = 1; r <= maxRing; r++) {
		for (var i = -r; i <= r; i++) {
			push(midX + i, midY - r); /* top edge */
			push(midX + i, midY + r); /* bottom edge */
		}
		for (var j = -r + 1; j <= r - 1; j++) {
			push(midX - r, midY + j); /* left edge */
			push(midX + r, midY + j); /* right edge */
		}
	}
	if (coords.length && misc.world.loadChunks(coords) === false) {
		/* Hit the in-flight cap, so part of the view is still unrequested. Force the
		   next call to rescan instead of taking the unchanged-view shortcut. */
		lastScan.valid = false;
	}
}

function onCameraMove() {
	eventSys.emit(e.camera.moved, camera);
	alignCamera();
	updateVisible();
	if (misc.world !== null) {
		requestMissingChunks();
		/* Free chunks that have moved far off screen. Throttled because it walks the
		   whole chunk map, and this runs on every mousemove while dragging. */
		var now = Date.now();
		if (now - lastUnload > unloadInterval) {
			lastUnload = now;
			misc.world.unloadFarChunks();
		}
	}
	requestRender(renderer.rendertype.FX);
}

function getCenterPixel() {
	var x = Math.round(cameraValues.x + window.innerWidth / camera.zoom / 2);
	var y = Math.round(cameraValues.y + window.innerHeight / camera.zoom / 2);
	return [x, y];
}

function centerCameraTo(x, y) {
	if(typeof(x) == "number" && !isNaN(x)){
		cameraValues.x = -(window.innerWidth / camera.zoom / 2) + x;
	}
	
	if(typeof(y) == "number" && !isNaN(y)){
		cameraValues.y = -(window.innerHeight / camera.zoom / 2) + y;
	}
	
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

/* When a wave of chunks finishes, ask for the next one. A view too large to request
   at once is filled in successive waves, and this is what drives them while the camera
   sits still. Terminates on its own: once nothing is missing no request is made, so
   waitingForChunks never returns to zero again and this stops firing. */
eventSys.on(e.net.chunk.allLoaded, () => {
	if (misc.world !== null) {
		lastScan.valid = false;
		requestMissingChunks();
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

	document.addEventListener("visibilitychange", onVisibilityChange);

	const mkPatternFromUrl = (url, cb) => {
		var patImg = new Image();
		var patCanv = document.createElement("canvas");
		var patCanvCtx = patCanv.getContext("2d");
		patImg.onload = () => {
			patCanv.width = patImg.width;
			patCanv.height = patImg.height;
			patCanvCtx.drawImage(patImg, 0, 0);
			var pat = patCanvCtx.createPattern(patCanv, "repeat");
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
