"use strict";
import { protocol, EVENTS as e, options } from './conf.js';
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
		this.tmpChunkBuf = netdata;
		this.view = null;
	}

	update(x, y, color) {
		/* WARNING: Should absMod if not power of two */
		x &= (protocol.chunkSize - 1);
		y &= (protocol.chunkSize - 1);
		this.view.set(x, y, 0xFF000000 | color);
		this.needsRedraw = true;
	}

	get(x, y) {
		x &= (protocol.chunkSize - 1);
		y &= (protocol.chunkSize - 1);
		return this.view.get(x, y);
	}

	set(data) {
		if (Number.isInteger(data)) {
			this.view.fill(0xFF000000 | data);
		} else {
			this.view.fillFromBuf(data);
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
		this.players = {};
		this.undoHistory = [];
		
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
		var key = `${x},${y}`;
		if (!this.chunks[key] && net.isConnected()) {
			net.protocol.requestChunk(x, y);
		}
	}

	allChunksLoaded() {
		return net.protocol.allChunksLoaded();
	}

	tilesUpdated(tiles) {
		var chunksUpdated = {};
		var chunkSize = protocol.chunkSize;
		for (var i = 0; i < tiles.length; i++) {
			var t = tiles[i];
			var key = `${Math.floor(t.x / chunkSize)},${Math.floor(t.y / chunkSize)}`;
			var chunk = this.chunks[key];
			if (chunk) {
				chunksUpdated[key] = chunk;
				chunk.update(t.x, t.y, t.rgb);
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

	setPixel(x, y, color, noUndo) {
		var chunkSize = protocol.chunkSize;
		var chunk = this.chunks[`${Math.floor(x / chunkSize)},${Math.floor(y / chunkSize)}`];
		if (chunk) {
			var oldPixel = this.getPixel(x, y, chunk);
			if (!oldPixel || (oldPixel[0] === color[0] && oldPixel[1] === color[1] && oldPixel[2] === color[2])
			|| !net.protocol.updatePixel(x, y, color)) {
				return false;
			}
			if (!noUndo) {
				oldPixel.push(x, y);
				this.undoHistory.push(oldPixel);
			}
			chunk.update(x, y, colorUtils.u24_888(color[0], color[1], color[2]));
			eventSys.emit(e.renderer.updateChunk, chunk);
			return true;
		}
		return false;
	}

	undo() {
		if (this.undoHistory.length === 0) {
			return false;
		}
		var remainingTries = this.undoHistory.length;
		while (--remainingTries >= 0) {
			var undo = this.undoHistory[remainingTries];
			var px = this.getPixel(undo[3], undo[4]);
			if (px[0] === undo[0] && px[1] === undo[1] && px[2] === undo[2]) {
				this.undoHistory.splice(remainingTries, 1);
			} else if (this.setPixel(undo[3], undo[4], undo, true)) {
				/* TODO: move cursor to pixel pos */
				this.undoHistory.splice(remainingTries, 1);
				break;
			}
		}
	}

	getChunkAt(x, y) {
		return this.chunks[`${x},${y}`];
	}

	getPixel(x, y, chunk) {
		if (!chunk) {
			var chunkSize = protocol.chunkSize;
			chunk = this.chunks[`${Math.floor(x / chunkSize)},${Math.floor(y / chunkSize)}`];
		}
		
		if (chunk) {
			var clr = chunk.get(x, y);
			return [clr & 0xFF, clr >> 8 & 0xFF, clr >> 16 & 0xFF];
		}
		return null;
	}

	validMousePos(tileX, tileY) {
		return this.getPixel(tileX, tileY) !== null;
	}
	
	chunkLoaded(chunk) {
		this.chunks[`${chunk.x},${chunk.y}`] = chunk;
		eventSys.emit(e.renderer.addChunk, chunk);
	}
	
	chunkUnloaded(chunk) {
		delete this.chunks[`${chunk.x},${chunk.y}`];
		eventSys.emit(e.renderer.rmChunk, chunk);
	}

	chunkPasted(x, y, data) {
		var chunk = this.chunks[`${x},${y}`];
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
