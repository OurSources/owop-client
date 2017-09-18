"use strict";
import { protocol, EVENTS as e } from './conf.js';
import { eventSys } from './global.js';
import { colorUtils } from './util/color.js';
import { net } from './networking.js';
import { camera, isVisible, renderer } from './canvas_renderer.js';
import { mouse } from './main.js';
import { Player } from './Player.js';

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
		/* WARNING: Should absMod if not power of two */
		x &= (protocol.chunkSize - 1);
		y &= (protocol.chunkSize - 1);
		this.u32data[y * protocol.chunkSize + x] = 0xFF000000 | color;
		this.needsRedraw = true;
	}

	get(x, y) {
		x &= (protocol.chunkSize - 1);
		y &= (protocol.chunkSize - 1);
		return this.u32data[y * protocol.chunkSize + x];
	}

	set(data) {
		if (Number.isInteger(data)) {
			for (var i = 0; i < this.u32data.length; i++) {
				this.u32data[i] = 0xFF000000 | data;
			}
		} else {
			for (var i = 0; i < this.u32data.length; i++) {
				var j = 3 * i;
				this.u32data[i] = 0xFF000000 | data[j + 2] << 16 | data[j + 1] << 8 | data[j];
			}
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
		const setCFunc = (x, y, data) => this.chunkPasted(x, y, data);
		const disconnectedFunc = () => eventSys.emit(e.net.world.leave);
		const updateTileFunc = t => this.tilesUpdated(t);
		const updatePlayerFunc = p => this.playersMoved(p);
		const destroyPlayerFunc = p => this.playersLeft(p);
		const leaveWFunc = () => {
			this.unloadAllChunks();
			this.playersLeft(Object.keys(this.players));
			eventSys.removeListener(e.net.chunk.load, loadCFunc);
			eventSys.removeListener(e.net.chunk.unload, unloadCFunc);
			eventSys.removeListener(e.net.chunk.set, setCFunc);
			eventSys.removeListener(e.net.disconnected, disconnectedFunc);
			eventSys.removeListener(e.net.world.tilesUpdated, updateTileFunc);
			eventSys.removeListener(e.net.world.playersMoved, updatePlayerFunc);
			eventSys.removeListener(e.net.world.playersLeft, destroyPlayerFunc);
		};
		eventSys.on(e.net.chunk.load, loadCFunc);
		eventSys.on(e.net.chunk.unload, unloadCFunc);
		eventSys.on(e.net.chunk.set, setCFunc);
		eventSys.on(e.net.world.tilesUpdated, updateTileFunc);
		eventSys.on(e.net.world.playersMoved, updatePlayerFunc);
		eventSys.on(e.net.world.playersLeft, destroyPlayerFunc);
		eventSys.once(e.net.world.leave, leaveWFunc);
		eventSys.once(e.net.disconnected, disconnectedFunc);
	}
	
	loadChunk(x, y) {
		var key = [x, y].join();
		if (!this.chunks[key] && net.isConnected()) {
			net.protocol.requestChunk(x, y);
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

	playersMoved(players) {
		var rendered = false;
		for (const id in players) {
			var player = this.players[id];
			var u = players[id];
			if (player) {
				player.update(u.x, u.y, u.rgb, u.tool);
			} else {
				player = this.players[id] = new Player(u.x, u.y, u.rgb, u.tool, id);
			}
			if (!rendered && (isVisible(player.endX / 16, player.endY / 16, 4, 4)
					|| isVisible(player.x / 16, player.y / 16, 4, 4))) {
				rendered = true;
				renderer.render(renderer.rendertype.FX);
			}
		}
	}

	playersLeft(ids) {
		var rendered = false;
		for (var i = 0; i < ids.length; i++) {
			var id = ids[i];
			var player = this.players[id];
			if (player) {
				player.disconnect();
				if (!rendered && isVisible(player.x / 16, player.y / 16, 4, 4)) {
					rendered = true;
					renderer.render(renderer.rendertype.FX);
				}
			}
			delete this.players[id];
		}
	}

	setPixel(x, y, color) {
		var chunk = this.getChunkAt(Math.floor(x / protocol.chunkSize), Math.floor(y / protocol.chunkSize));
		if (chunk) {
			var oldPixel = this.getPixel(x, y, chunk);
			if ((oldPixel[0] === color[0] && oldPixel[1] === color[1] && oldPixel[2] === color[2])
			|| !net.protocol.updatePixel(x, y, color)) {
				return false;
			}
			chunk.update(x, y, colorUtils.u24_888(color[0], color[1], color[2]));
			eventSys.emit(e.renderer.updateChunk, chunk);
			return true;
		}
		return false;
	}

	getChunkAt(x, y) {
		return this.chunks[[x, y]];
	}
	
	getPixel(x, y, chunk) {
		if (!chunk) {
			var fl     = Math.floor;
			var key    = [fl(x / protocol.chunkSize), fl(y / protocol.chunkSize)].join();
			chunk = this.chunks[key];
		}
		
		if (chunk) {
			var clr = chunk.get(x, y);
			return [clr & 0xFF, clr >> 8 & 0xFF, clr >> 16 & 0xFF];
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

	chunkPasted(x, y, data) {
		var chunk = this.chunks[[x, y]];
		if (chunk) {
			chunk.set(data);
			eventSys.emit(e.renderer.updateChunk, chunk);
		}
	}
	
	unloadAllChunks() {
		for (const c in this.chunks) {
			this.chunks[c].remove();
		}
	}
}
