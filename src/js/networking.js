"use strict";

import { EVENTS as e, protocol } from './conf.js';
import { eventSys, PublicAPI } from './global.js';

export const netVal = {
	connection: null,
	updateInterval: null,
	placeBucket: null, /* TODO: move this */
	chatBucket: null
};

export const net = {
	protocol: null,
	isConnected: isConnected,
	connect: connect
};

PublicAPI.net = net;

function isConnected() {
	return net.protocol !== null && net.protocol.isConnected();
}

function updatePixel(x, y, color) {
	var fl = Math.floor;
	var key = fl(x / 256) + ',' + fl(y / 256);
	var chunk = this.chunks[key];
	var crgb = this.getPixel(x, y);
	if (chunk) {
		crgb = u16_565(crgb[2], crgb[1], crgb[0]);
		var rgb = u16_565(color[2], color[1], color[0]);
		if (this.net.isConnected() && crgb !== rgb && this.net.placeBucket.canSpend(1)) {
			chunk.update(x & 0xFF, y & 0xFF, color);
			var array = new ArrayBuffer(11);
			var dv = new DataView(array);
			dv.setInt32(0,  x, true);
			dv.setInt32(4,  y, true);
			dv.setUint16(8, rgb, true);
			//dv.setUint8(10, 255);
			this.net.connection.send(array);
			this.renderer.requestRender(2); /* Request world re-render */
			return true;
		}
	}
	return false;
}

function sendUpdates() {
	var worldx = this.mouse.worldX;
	var worldy = this.mouse.worldY;
	var lastx = this.mouse.lastWorldX;
	var lasty = this.mouse.lastWorldY;
	var selrgb = this.palette[this.paletteIndex];
	var oldrgb = this.lastColor;
	if (isConnected() && (worldx != lastx || worldy != lasty
	|| this.toolSelected != this.lastTool || !(selrgb[0] == oldrgb[0] && selrgb[1] == oldrgb[1] && selrgb[2] == oldrgb[2]))) {
		this.mouse.lastWorldX = worldx;
		this.mouse.lastWorldY = worldy;
		this.lastTool = this.toolSelected;
		this.lastColor = selrgb;
		// Send mouse position
		var array = new ArrayBuffer(12);
		var dv = new DataView(array);
		dv.setInt32(0, worldx, true);
		dv.setInt32(4, worldy, true);
		dv.setUint16(8, u16_565(selrgb[2], selrgb[1], selrgb[0]), true);
		dv.setUint8(10, this.toolSelected);
		this.net.connection.send(array);
	}
}

function sendMessage(message) {
	if (message.length && this.net.isConnected()) {
		if (this.net.chatBucket.canSpend(1)) {
			this.net.connection.send(message + String.fromCharCode(10));
		} else {
			this.chatMessage("Slow down! You're talking too fast!");
		}
	}
}

function connect(url, worldName) {
	eventSys.emit(e.net.connecting);
	net.connection = new WebSocket(url);
	net.connection.binaryType = "arraybuffer";
	net.protocol = new protocol.class(net.connection, worldName);

	/*net.connection.onopen = function() {
		this.net.placeBucket = new Bucket(32, 4);
		this.net.chatBucket = new Bucket(4, 6);

		this.net.worldName = decodeURIComponent(window.location.pathname).replace(/^(\/beta565(?:\/)|\/)/g, "");
		if (this.net.worldName === "") {
			this.net.worldName = "main";
		}
		var worldName = this.net.joinWorld(this.net.worldName);
		console.log("Connected! Joining world: " + worldName);
		this.events.emit("connected");
	
		this.updateCamera();
	
		this.net.updateInterval = setInterval(this.net.sendUpdates, 1000 / this.options.netUpdateSpeed);
	}.bind(this);

	this.net.connection.onmessage = function(message) {
		var fl = Math.floor;
		var time = Date.now();
		message = message.data;
		if (typeof message === "string") {
			if (message.indexOf("DEV") == 0) {
				this.events.emit("net_devchat", message.slice(3));
			} else {
				this.events.emit("net_chat", message);
			}
			return;
		}
		var dv = new DataView(message);
		switch (dv.getUint8(0)) {
			case 0: // Get id
				this.net.id = dv.getUint32(1, true);
				this.net.players = {};
				console.log("ID:", this.net.id);
				if (this.options.oldserver) {
					this.chatMessage("[Server] Joined world: \"" + this.net.worldName + "\", your ID is: " + this.net.id + "!");
				}
				break;
			case 1: // Get all cursors, tile updates, disconnects
				var shouldrender = 0;
				// Cursors
				for (var i = dv.getUint8(1); i--;) {
  					var pid = dv.getUint32(2 + i * 15, true);
	  				var pmx = dv.getInt32(2 + i * 15 + 4, true);
	  				var pmy = dv.getInt32(2 + i * 15 + 8, true);
	  				var prgb = dv.getUint16(2 + i * 15 + 12, true);
	  				var ptool = dv.getUint8(2 + i * 15 + 14);
					var player = this.net.players[pid];
	  				if (player) {
	  					player.update(pmx, pmy, prgb, ptool, time);
	  				} else if (pid !== this.net.id) {
						++this.net.playerCount;
						this.net.updatePlayerCount();
	  					this.net.players[pid] = new Player(pmx, pmy, prgb, ptool, pid);
	  				}
					if (this.isVisible(pmx / 16, pmy / 16, 4, 4)
					|| (player && this.isVisible(player.x / 16, player.y / 16, 4, 4))) {
						shouldrender |= 1; /* Re-render players and fx 
					}
	  			}
	  			var off = 2 + dv.getUint8(1) * 15;
	  			// Tile updates
	  			for (var j = dv.getUint16(off, true); j--;) {
	  				var bpx = dv.getInt32(2 + off + j * 10, true);
	  				var bpy = dv.getInt32(2 + off + j * 10 + 4, true);
	  				var brgb = dv.getUint16(2 + off + j * 10 + 8, true);
					/* Just check for the whole chunk 
	  				if (this.isVisible(bpx, bpy, 1, 1)) {
						shouldrender |= 3; /* Chunks, players, fx 
						new Fx(1, bpx, bpy, {color: brgb ^ 0xFFFF, time: time});
	  				}
					var key = fl(bpx / 256) + ',' + fl(bpy / 256);
					var chunk = this.chunks[key];
	  				if (chunk) {
						shouldrender |= 2;
	  					chunk.update(bpx & 0xFF, bpy & 0xFF, arrFrom565(brgb));
	  				}
	  			}
	  			off += dv.getUint16(off, true) * 10 + 2;
	  			// Disconnects
	  			for (var k = dv.getUint8(off); k--;) {
	  				var dpid = dv.getUint32(1 + off + k * 4, true);
					var player = this.net.players[dpid];
	  				if (player) {
						if (this.isVisible(player.nx / 16, player.ny / 16, 4, 4)) {
							shouldrender |= 1;
						}
	  					player.disconnect();
						if (this.net.playerCount > 0) {
							--this.net.playerCount;
							this.net.updatePlayerCount();
						}
	  				}
					delete this.net.players[dpid];
	  			}
				if (shouldrender) {
					this.renderer.requestRender(shouldrender);
				}
				break;
			case 2: // Get chunk
				var chunkX = dv.getInt32(1, true);
				var chunkY = dv.getInt32(5, true);
				var u8data = new Uint8Array(message, 9);
				var u16data = new Uint16Array(decompress(u8data).buffer);
				var key = [chunkX, chunkY].join();
				var chunk = this.chunks[key];
				if (!this.chunksLoading[key] && chunk) {
					// If chunk was not requested, show eraser fx
					new Fx(3, chunkX * 16, chunkY * 16, {time: time});
					for (var n = 0; n < 256 * 256; n++) {
						chunk.u32data[n] = 0xFFFFFFFF;
					}
					chunk.needsRedraw = true;
				} else {
					delete this.chunksLoading[key];
					var chunk = this.chunks[key] = new Chunk(chunkX, chunkY, u16data);
					this.events.emit("chunkload", chunk);
				}
				break;
			case 3: // Teleport
				this.camera.x = dv.getInt32(1, true) - (window.innerWidth / this.camera.zoom / 2.5);
				this.camera.y = dv.getInt32(5, true) - (window.innerHeight / this.camera.zoom / 2.5);
				this.updateCamera();
				break;
			case 4: // Got admin
				this.isAdmin = true;
				this.net.placeBucket.time = 0;
				// Add tools to the tool-select menu
				this.updateToolbar();
				this.showDevChat(true);
				break;
		}
	}.bind(this);

	this.net.connection.onclose = function() {
		clearInterval(this.net.updateInterval);
		this.net.playerCount = 1;
		this.isAdmin = false;
		this.updateToolbar();
		console.log("Disconnected from server");
		this.events.emit("disconnected");
	}.bind(this);*/
}
