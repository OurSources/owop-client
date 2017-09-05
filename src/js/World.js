"use strict";
import { protocol, EVENTS as e } from './conf.js';
import { eventSys } from './global.js';
import { colorUtils as color } from './util/color.js';
import { net } from './networking.js';
import { camera, isVisible, mouse } from './main.js';

export class Chunk {
	constructor(x, y, netdata) { /* netdata = Uint32Array */
		this.needsRedraw = false;
		this.x = x;
		this.y = y;
		this.data = new ImageData(protocol.chunkSize, protocol.chunkSize);
		this.u32data = new Uint32Array(this.data.data.buffer);
		this.u32data.set(netdata);
	}
	
	update(x, y, color) {
		this.u32data[y * protocol.chunkSize + x] = 0xFF000000 | color;
		this.needsRedraw = true;
	}

	clear() {
		for (var i = 0; i < this.u32data.length; i++) {
			this.u32data[i] = 0xFFFFFFFF;
		}
		this.needsRedraw = true;
	}
	
	remove() { /* Can be called when manually unloading too */
		eventSys.emit(e.net.chunk.unload, this);
	}
}

export class World {
	constructor(worldName) {
		this.name = worldName;
		this.chunks = {};
		this.chunksLoading = {};
		this.players = {};
		
		const loadCFunc = chunk => this.chunkLoaded(chunk);
		const unloadCFunc = chunk => this.chunkUnloaded(chunk);
		const clearCFunc = (x, y) => this.chunkCleared(x, y); /* Will probably remove */
		const disconnectedFunc = () => eventSys.emit(e.net.world.leave);
		const updateTileFunc = t => this.tilesUpdated(t);
		const leaveWFunc = () => {
			this.unloadAllChunks();
			eventSys.removeListener(e.net.chunk.load, loadCFunc);
			eventSys.removeListener(e.net.chunk.unload, unloadCFunc);
			eventSys.removeListener(e.net.chunk.clear, clearCFunc);
			eventSys.removeListener(e.net.disconnected, disconnectedFunc);
			eventSys.removeListener(e.net.world.tilesUpdated, updateTileFunc);
		};
		eventSys.on(e.net.chunk.load, loadCFunc);
		eventSys.on(e.net.chunk.unload, unloadCFunc);
		eventSys.on(e.net.chunk.clear, clearCFunc);
		eventSys.on(e.net.world.tilesUpdated, updateTileFunc);
		eventSys.once(e.net.world.leave, leaveWFunc);
		eventSys.once(e.net.disconnected, disconnectedFunc);
	}
	
	loadChunk(x, y) {
		var key = [x, y].join();
		if (!this.chunks[key] && net.isConnected() && !this.chunksLoading[key]) {
			net.protocol.requestChunk(x, y);
			this.chunksLoading[key] = true;
		}
	}
	
	unloadFarChunks() { /* Slow? */
		var camx = camera.x;
		var camy = camera.y;
		var zoom = camera.zoom;
		var camw = window.innerWidth / zoom | 0;
		var camh = window.innerHeight / zoom | 0;
		var ctrx = camx + camw / 2;
		var ctry = camy + camh / 2;
		var delay = 0;
		for (var c in this.chunks) {
			c = this.chunks[c];
			if (!isVisible(c.x * protocol.chunkSize, c.y * protocol.chunkSize, protocol.chunkSize, protocol.chunkSize)) {
				var dx = Math.abs(ctrx / protocol.chunkSize - c.x) | 0;
				var dy = Math.abs(ctry / protocol.chunkSize - c.y) | 0;
				var dist = dx + dy; /* no sqrt please */
				//console.log(dist);
				if (dist > 30) {
					/* Slowly unload chunks to prevent lag spikes */
					setTimeout(c => c.remove(), ++delay, c);
				}
			}
		}
	}

	tilesUpdated(tiles) {
		var chunksUpdated = {};
		for (var i = 0; i < tiles.length; i++) {
			var t = tiles[i];
			var key = [Math.floor(t.x / protocol.chunkSize), Math.floor(t.y / protocol.chunkSize)].join();
			var chunk = this.chunks[key];
			if (chunk) {
				chunksUpdated[key] = chunk;
				/* WARNING: should absMod if not power of two */
				chunk.update(t.x & (protocol.chunkSize - 1), t.y & (protocol.chunkSize - 1), t.rgb);
			}
		}
		for (var c in chunksUpdated) {
			eventSys.emit(e.renderer.updateChunk, chunksUpdated[c]);
		}
	}
	
	getPixel(x, y) {
		var fl     = Math.floor;
		var key    = [fl(x / protocol.chunkSize), fl(y / protocol.chunkSize)].join();
		/* WARNING: should absMod if not power of two */
		var pixelX = x & (protocol.chunkSize - 1);
		var pixelY = y & (protocol.chunkSize - 1);
		var chunk = this.chunks[key];
		if (chunk) {
			var clr = chunk.u32data[pixelY * protocol.chunkSize + pixelX];
			return color.to565(clr & 0xFF, clr >> 8 & 0xFF, clr >> 16 & 0xFF);
		}
		return null;
	}

	validMousePos(tileX, tileY) {
		return mouse.insideViewport && this.getPixel(tileX, tileY);
	}
	
	chunkLoaded(chunk) {
		this.chunks[[chunk.x, chunk.y]] = chunk;
		eventSys.emit(e.renderer.addChunk, chunk);
	}
	
	chunkUnloaded(chunk) {
		delete this.chunks[[chunk.x, chunk.y]];
		eventSys.emit(e.renderer.rmChunk, chunk);
	}

	chunkCleared(x, y) {
		var chunk = this.chunks[[x, y]];
		if (chunk) {
			chunk.clear();
			eventSys.emit(e.renderer.updateChunk, chunk);
		}
	}
	
	unloadAllChunks() {
		for (const c in this.chunks) {
			this.chunks[c].remove();
		}
	}
}
