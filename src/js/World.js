"use strict";
import { protocol, EVENTS as e, options, RANK } from './conf.js';
import { eventSys } from './global.js';
import { colorUtils } from './util/color.js';
import { net } from './networking.js';
import { camera, isVisible, renderer } from './canvas_renderer.js';
import { mouse, sounds } from './main.js';
import { player } from './local_player.js';
import { Player } from './Player.js';
import { Fx } from './Fx.js';

let lastPlace = 0;

export class Chunk {
	constructor(x, y, netdata, locked) { /* netdata = Uint32Array */
		this.needsRedraw = false;
		this.x = x;
		this.y = y;
		this.tmpChunkBuf = netdata;
		this.view = null;
		this.locked = locked;
		this.lockedNeighbors = 0b0000; /* Up, Right, Down, Left */
	}

	update(x, y, color) {
		/* WARNING: Should absMod if not power of two */
		x &= (protocol.chunkSize - 1);
		y &= (protocol.chunkSize - 1);
		this.view.set(x, y, 0xFF000000 | color);
		this.needsRedraw = true;
	}

	forEach(cb) {
		var s = protocol.chunkSize;
		for (var i = 0; i < s; i++) {
			for (var j = 0; j < s; j++) {
				if (!cb(j, i, this.get(j, i))) {
					return false;
				}
			}
		}
		return true;
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
Chunk.dir = {
	UP: 0b1000,
	RIGHT: 0b0100,
	DOWN: 0b0010,
	LEFT: 0b0001
};

export class World {
	constructor(worldName) {
		this.name = worldName;
		this.chunks = {};
		this.protectedChunks = {};
		this.players = {};
		this.undoHistory = [];
		this.pathUpdaterTimeout = -1;
		this.pathFx = new Fx((fx, ctx, time) => {
			var retval = 1;
			if (fx.extra.path) {
				ctx.strokeStyle = "#525252";
				var l = ctx.lineWidth;
				ctx.lineWidth = 3 / camera.zoom;
				ctx.setTransform(camera.zoom, 0, 0, camera.zoom, -camera.x * camera.zoom, -camera.y * camera.zoom);
				if (time - fx.extra.placeTime < 1500) {
					ctx.globalAlpha = (1 - (time - fx.extra.placeTime) / 1500) * 0.5;
					ctx.fillStyle = renderer.patterns.unloaded;
					ctx.fill(fx.extra.path);
					retval = 0;
				}
				ctx.globalAlpha = 0.75;
				ctx.stroke(fx.extra.path);
				ctx.setTransform(1, 0, 0, 1, 0, 0);
				ctx.lineWidth = l;
			}
			return retval;
		});

		const loadCFunc = chunk => this.chunkLoaded(chunk);
		const unloadCFunc = chunk => this.chunkUnloaded(chunk);
		const setCFunc = (x, y, data) => this.chunkPasted(x, y, data);
		const lockCFunc = (x, y, newState) => this.chunkLocked(x, y, newState);
		const disconnectedFunc = () => eventSys.emit(e.net.world.leave);
		const updateTileFunc = t => this.tilesUpdated(t);
		const updatePlayerFunc = p => this.playersMoved(p);
		const destroyPlayerFunc = p => this.playersLeft(p);
		const leaveWFunc = () => {
			this.pathFx.delete();
			this.unloadAllChunks();
			this.playersLeft(Object.keys(this.players));
			eventSys.removeListener(e.net.chunk.load, loadCFunc);
			eventSys.removeListener(e.net.chunk.unload, unloadCFunc);
			eventSys.removeListener(e.net.chunk.set, setCFunc);
			eventSys.removeListener(e.net.chunk.lock, lockCFunc);
			eventSys.removeListener(e.net.disconnected, disconnectedFunc);
			eventSys.removeListener(e.net.world.tilesUpdated, updateTileFunc);
			eventSys.removeListener(e.net.world.playersMoved, updatePlayerFunc);
			eventSys.removeListener(e.net.world.playersLeft, destroyPlayerFunc);
		};
		eventSys.on(e.net.chunk.load, loadCFunc);
		eventSys.on(e.net.chunk.unload, unloadCFunc);
		eventSys.on(e.net.chunk.set, setCFunc);
		eventSys.on(e.net.chunk.lock, lockCFunc);
		eventSys.on(e.net.world.tilesUpdated, updateTileFunc);
		eventSys.on(e.net.world.playersMoved, updatePlayerFunc);
		eventSys.on(e.net.world.playersLeft, destroyPlayerFunc);
		eventSys.once(e.net.world.leave, leaveWFunc);
		eventSys.once(e.net.disconnected, disconnectedFunc);
	}
	
	makeLockedChunksPath() {
		const d = Chunk.dir;
		var mainPath = new Path2D();
		
		var vpoints = {};
		var hpoints = {};
		
		const addPoint = (fx, fy, tx, ty, points) => {
			const fkey = `${fx},${fy}`;
			const tkey = `${tx},${ty}`;
			if (tkey in points && fkey in points) {
				points[points[fkey]] = points[tkey];
				points[points[tkey]] = points[fkey];
				delete points[tkey];
				delete points[fkey];
			} else if (tkey in points) {
				var newTo = points[tkey];
				points[newTo] = fkey;
				delete points[tkey];
				points[fkey] = newTo;
			} else if (fkey in points) {
				var newFrom = points[fkey];
				points[newFrom] = tkey;
				delete points[fkey];
				points[tkey] = newFrom;
			} else {
				points[fkey] = tkey;
				points[tkey] = fkey;
			}
		};

		for (var k in this.protectedChunks) {
			const chunk = this.protectedChunks[k];
			const ln = chunk.lockedNeighbors;
			if (ln === (d.LEFT | d.DOWN | d.UP | d.RIGHT)) {
				continue;
			}
			
			if (!(ln & d.UP)) {
				addPoint(chunk.x + 1, chunk.y, chunk.x, chunk.y, hpoints);
			}
			if (!(ln & d.DOWN)) {
				addPoint(chunk.x, chunk.y + 1, chunk.x + 1, chunk.y + 1, hpoints);
			}

			if (!(ln & d.LEFT)) {
				addPoint(chunk.x, chunk.y + 1, chunk.x, chunk.y, vpoints);
			}
			if (!(ln & d.RIGHT)) {
				addPoint(chunk.x + 1, chunk.y + 1, chunk.x + 1, chunk.y, vpoints);
			}
		}
		
		var polys = 0;
		var pointobjs = [vpoints, hpoints];
		for (var p in vpoints) {
			var a = p.split(',');
			mainPath.moveTo(a[0] * 16, a[1] * 16);
			
			delete vpoints[vpoints[p]];
			delete vpoints[p];
			p = hpoints[p];
			for (var i = 0; p && (a = p.split(',')); i++) {
				var prev = pointobjs[(i + 1) & 1];
				var next = pointobjs[i & 1];
				mainPath.lineTo(a[0] * 16, a[1] * 16);
				
				delete prev[prev[p]];
				delete prev[p];
				p = next[p];
			}
			mainPath.closePath();
			++polys;
		}

		return polys === 0 ? null : mainPath;
	}
	
	findNeighborLockedChunks(chunk, newState) {
		const d = Chunk.dir;
		const checkSide = (x, y, to, from) => {
			var sidec = this.getChunkAt(chunk.x + x, chunk.y + y);
			if (sidec && sidec.locked) {
				if (newState) {
					chunk.lockedNeighbors |= to;
					sidec.lockedNeighbors |= from;
				} else {
					chunk.lockedNeighbors &= ~to;
					sidec.lockedNeighbors &= ~from;
				}
			}
		};
		
		checkSide(0, -1, d.UP, d.DOWN);
		checkSide(1, 0, d.RIGHT, d.LEFT);
		checkSide(-1, 0, d.LEFT, d.RIGHT);
		checkSide(0, 1, d.DOWN, d.UP);
		
		clearTimeout(this.pathUpdaterTimeout);
		this.pathUpdaterTimeout = setTimeout(() => {
			this.pathFx.update({path: this.makeLockedChunksPath()});
			renderer.render(renderer.rendertype.FX);
		}, 100);
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
		var time = Date.now();
		var chunkSize = protocol.chunkSize;
		var chunk = this.chunks[`${Math.floor(x / chunkSize)},${Math.floor(y / chunkSize)}`];
		if (chunk && (!chunk.locked || player.rank >= RANK.MODERATOR)) {
			var oldPixel = this.getPixel(x, y, chunk);
			if (!oldPixel || (oldPixel[0] === color[0] && oldPixel[1] === color[1] && oldPixel[2] === color[2])
			|| !net.protocol.updatePixel(x, y, color)) {
				return false;
			}
			if (!noUndo) {
				oldPixel.push(x, y, time);
				this.undoHistory.push(oldPixel);
			}
			chunk.update(x, y, colorUtils.u24_888(color[0], color[1], color[2]));
			eventSys.emit(e.renderer.updateChunk, chunk);
			if (time - lastPlace > 30) {
				sounds.play(sounds.place);
				lastPlace = time;
			}
			return true;
		} else if (chunk && chunk.locked) {
			this.pathFx.extra.placeTime = time;
			renderer.render(renderer.rendertype.FX);
		}
		return false;
	}

	undo(bulkUndo) {
		const eq = (a, b) => a[0] == b[0] && a[1] == b[1] && a[2] == b[2];
		if (this.undoHistory.length === 0) {
			return false;
		}
		var changeTime = null;
		for (var i = this.undoHistory.length; --i >= 0;) {
			var undo = this.undoHistory[i];
			if (!changeTime) {
				changeTime = undo[5];
			}
			var px = this.getPixel(undo[3], undo[4]);
			if (px) {
				var shouldContinue = !bulkUndo || changeTime - undo[5] < 500;
				var unchanged = eq(px, undo);
				if (!shouldContinue) {
					break;
				}
				if (unchanged || this.setPixel(undo[3], undo[4], undo, true)) {
					this.undoHistory.splice(i, 1);
					if (!bulkUndo) {
						break;
					}
				}
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

	chunkLocked(x, y, newState) {
		const key = `${x},${y}`;
		var chunk = this.getChunkAt(x, y);
		if (chunk) {
			if (newState) {
				this.protectedChunks[key] = chunk;
				chunk.locked = true;
			} else {
				delete this.protectedChunks[key];
				chunk.locked = false;
			}
			this.findNeighborLockedChunks(chunk, newState);
		}
	}

	chunkLoaded(chunk) {
		const key = `${chunk.x},${chunk.y}`;
		this.chunks[key] = chunk;
		if (chunk.locked) {
			this.protectedChunks[key] = chunk;
			this.findNeighborLockedChunks(chunk, chunk.locked);
		}
		eventSys.emit(e.renderer.addChunk, chunk);
	}

	chunkUnloaded(chunk) {
		const key = `${chunk.x},${chunk.y}`;
		delete this.chunks[key];
		if (chunk.locked) {
			delete this.protectedChunks[key];
			chunk.locked = false;
			this.findNeighborLockedChunks(chunk, chunk.locked);
		}
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
