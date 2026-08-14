'use strict';
import { Protocol } from './Protocol.js';
import { EVENTS as e, RANK, options } from './../conf.js';
import { eventSys, PublicAPI } from './../global.js';
import { Chunk } from './../World.js';
import { Bucket } from './../util/Bucket.js';
import { decompress, decompressToU32 } from './../util/misc.js';
import { loadAndRequestCaptcha } from './../captcha.js';
import { colorUtils as color } from './../util/color.js';
import { player, shouldUpdate, networkRankVerification } from './../local_player.js';
import { camera, applyRegionLod } from './../canvas_renderer.js';
import { mouse, elements, misc } from './../main.js';
import { retryingConnect } from './../main.js';

export const captchaState = {
	CA_WAITING: 0,
	CA_VERIFYING: 1,
	CA_VERIFIED: 2,
	CA_OK: 3,
	CA_INVALID: 4
};

export const OldProtocol = {
	class: null,
	chunkSize: 16,
	netUpdateSpeed: 20,
	clusterChunkAmount: 64,
	maxWorldNameLength: 24,
	worldBorder: 0xFFFFF,
	chatBucket: [4, 6],
	placeBucket: {
		[RANK.NONE]: [0, 1],
		[RANK.USER]: [32, 4],
		[RANK.MODERATOR]: [32, 2],
		[RANK.ADMIN]: [32, 0]
	},
	maxMessageLength: {
		[RANK.NONE]: 128,
		[RANK.USER]: 128,
		[RANK.MODERATOR]: 512,
		[RANK.ADMIN]: 16384
	},
	tools: {
		id: {}, /* Generated automatically */
		0: 'cursor',
		1: 'move',
		2: 'pipette',
		3: 'eraser',
		4: 'zoom',
		5: 'fill',
		6: 'paste',
		7: 'export',
		8: 'line',
		9: 'protect',
		10: 'copy'
	},
	misc: {
		worldVerification: 25565,
		chatVerification: String.fromCharCode(10),
		tokenVerification: 'CaptchA'
	},
	opCode: {
		client: {

		},
		server: {
			setId: 0,
			worldUpdate: 1,
			chunkLoad: 2,
			teleport: 3,
			setRank: 4,
			captcha: 5,
			setPQuota: 6,
			chunkProtected: 7,
			maxCount: 8,
			donUntil: 9,
			chunkBatch: 11,
			regionLod: 12
		}
	},
	/* Region level-of-detail: one averaged colour per chunk, so a 16x16-chunk region
	   costs 768 bytes instead of the ~200KB its chunks cost at full detail. Requested
	   when the view is too wide to fetch in detail promptly. */
	regionLodGuard: 25566,
	regionChunkAmount: 16,
	maxLodRegionsPerRequest: 1024,
	/* Batched chunk requests: [u16 guard][u16 count][u16 reserved] + count * (i32 x, i32 y).
	   The guard doubles as a marker so the server can tell these apart from the
	   fixed-length packets it dispatches on byte length. */
	chunkBatchGuard: 25565,
	/* The server caps incoming frames at 32768 bytes (uWS maxPayloadLength), so a
	   request packet can hold at most (32768 - 6) / 8 = 4095 chunks. Stay well under
	   that and split larger screens across several packets. */
	maxChunkBatchCount: 2048,
	/* How long a chunk may stay in chunksLoading before it is considered lost and
	   becomes eligible to be requested again. */
	chunkRequestTimeout: 10000,
	/* Chunks must have stopped arriving for this long before stale requests are swept,
	   so a slow but healthy load is never mistaken for a stall. */
	chunkStallTimeout: 3000,
	/* Upper bound on chunks awaiting a reply. Caps how much of a very zoomed-out view
	   is committed to at once, so the stream stays responsive to camera movement. */
	maxInFlightChunks: 4096
};

for (const id in OldProtocol.tools) {
	if (+id >= 0) {
		OldProtocol.tools.id[OldProtocol.tools[id]] = +id;
	}
}

function stoi(string, max) {
	var ints = [];
	var fstring = "";
	string = string.toLowerCase();
	for (var i = 0; i < string.length && i < max; i++) {
		var charCode = string.charCodeAt(i);
		if ((charCode < 123 && charCode > 96)
		|| (charCode < 58 && charCode > 47)
		|| charCode == 95 || charCode == 46) {
			fstring += String.fromCharCode(charCode);
			ints.push(charCode);
		}
	}
	return [ints, fstring];
}

class OldProtocolImpl extends Protocol {
	constructor(ws, worldName, captcha) {
		super(ws);
		super.hookEvents(this);
		this.lastSentX = 0;
		this.lastSentY = 0;
		this.playercount = 1;
		this.worldName = worldName ? worldName : options.defaultWorld;
		this.players = {};
		this.chunksLoading = {}; /* duplicate */
		this.lastChunkTime = Date.now(); /* when a chunk last arrived, for stall detection */
		this.waitingForChunks = 0;
		this.pendingEdits = {};
		this.id = null;
		this.captcha = captcha;

		var params = OldProtocol.chatBucket;
		this.chatBucket = new Bucket(params[0], params[1]);
		params = OldProtocol.placeBucket[player.rank];
		this.placeBucket = new Bucket(params[0], params[1]);
		this.placeBucketMult = 1;
		this.donUntilTs = 0;

		this.interval = null;
		this.clet = null;

		this.joinFunc = () => {
			this.placeBucket.lastCheck = Date.now();
			this.placeBucket.allowance = 0;
			//this.chatBucket.allowance = 0;
			this.interval = setInterval(() => this.sendUpdates(), 1000 / OldProtocol.netUpdateSpeed);
		};

		const rankChanged = rank => {
			this.placeBucket.infinite = rank === RANK.ADMIN;
			elements.chatInput.maxLength = OldProtocol.maxMessageLength[rank];
		};
		this.leaveFunc = () => {
			eventSys.removeListener(e.net.sec.rank, rankChanged);
			eventSys.emit(e.net.donUntil, 0, 1);
		};
		eventSys.once(e.net.world.join, this.joinFunc);
		eventSys.on(e.net.sec.rank, rankChanged);
	}

    errorHandler(err) {
		super.errorHandler(err);
    }

	closeHandler() {
		super.closeHandler();
		clearInterval(this.interval);
		eventSys.emit(e.net.sec.rank, RANK.NONE);
		eventSys.removeListener(e.net.world.join, this.joinFunc);
		this.leaveFunc();
	}

	messageHandler(message) {
		message = message.data;
		if (typeof message === "string") {
			if (message.indexOf("DEV") == 0) {
				eventSys.emit(e.net.devChat, message.slice(3));
			} else {
				eventSys.emit(e.net.chat, message);
			}
			return;
		}

		var dv = new DataView(message);
		var oc = OldProtocol.opCode.server;
		switch (dv.getUint8(0)) {
			case oc.setId: // Get id
				let id = dv.getUint32(1, true);
				this.id = id;
				eventSys.emit(e.net.world.join, this.worldName);
				eventSys.emit(e.net.world.setId, id);
				eventSys.emit(e.net.playerCount, this.playercount);
				eventSys.emit(e.net.chat, JSON.stringify({
					sender: 'server',
					type: 'info',
					data:{
						message: "[Server] Joined world: \"" + this.worldName + "\", your ID is: " + id + "!"
					}
				}));
				break;

			case oc.worldUpdate: // Get all cursors, tile updates, disconnects
				var shouldrender = 0;
				// Cursors
				var updated = false;
				var updates = {};
				for (var i = dv.getUint8(1); i--;) {
					updated = true;
					var pid = dv.getUint32(2 + i * 16, true);
					if (pid === this.id) {
						continue;
					}
	  				var pmx = dv.getInt32(2 + i * 16 + 4, true);
	  				var pmy = dv.getInt32(2 + i * 16 + 8, true);
	  				var pr = dv.getUint8(2 + i * 16 + 12);
	  				var pg = dv.getUint8(2 + i * 16 + 13);
	  				var pb = dv.getUint8(2 + i * 16 + 14);
	  				var ptool = dv.getUint8(2 + i * 16 + 15);
					updates[pid] = {
						x: pmx,
						y: pmy,
						rgb: [pr, pg, pb],
						tool: OldProtocol.tools[ptool]
					};
	  				if (!this.players[pid]) {
						++this.playercount;
						eventSys.emit(e.net.playerCount, this.playercount);
	  					this.players[pid] = true;
	  				}
				}
				if (updated) {
					eventSys.emit(e.net.world.playersMoved, updates);
				}
	  			var off = 2 + dv.getUint8(1) * 16;
				// Tile updates
				updated = false;
				updates = [];
	  			for (var i = dv.getUint16(off, true), j = 0; j < i; j++) {
					updated = true;
					var bid = dv.getUint32(2 + off + j * 15, true);
	  				var bpx = dv.getInt32(2 + off + j * 15 + 4, true);
	  				var bpy = dv.getInt32(2 + off + j * 15 + 8, true);
	  				var br = dv.getUint8(2 + off + j * 15 + 12);
	  				var bg = dv.getUint8(2 + off + j * 15 + 13);
	  				var bb = dv.getUint8(2 + off + j * 15 + 14);
					var bbgr = bb << 16 | bg << 8 | br;
					updates.push({
						x: bpx,
						y: bpy,
						rgb: bbgr,
						id: bid
					});

					var edkey = `${bpx},${bpy}`;
					var edtmoid = this.pendingEdits[edkey];
					if (edtmoid) {
						clearTimeout(edtmoid);
						delete this.pendingEdits[edkey];
					}
				}
				if (updated) {
					eventSys.emit(e.net.world.tilesUpdated, updates);
				}
	  			off += dv.getUint16(off, true) * 15 + 2;
				// Disconnects
				var decreased = false;
				updated = false;
				updates = [];
	  			for (var k = dv.getUint8(off); k--;) {
					updated = true;
					var dpid = dv.getUint32(1 + off + k * 4, true);
					updates.push(dpid);
					if (this.players[dpid] && this.playercount > 1) {
						decreased = true;
						--this.playercount;
						delete this.players[dpid];
					}
	  			}
				if (updated) {
					eventSys.emit(e.net.world.playersLeft, updates);
					if (decreased) {
						eventSys.emit(e.net.playerCount, this.playercount);
					}
				}
				break;

			case oc.chunkLoad: // Get chunk
				this.processChunkPacket(message, 0, message.byteLength);
				break;

			case oc.regionLod: { // Coarse region previews: one colour per chunk
				var lodCount = dv.getUint16(1, true);
				var lodOffset = 3;
				for (var lr = 0; lr < lodCount; lr++) {
					var regionX = dv.getInt32(lodOffset, true);
					var regionY = dv.getInt32(lodOffset + 4, true);
					applyRegionLod(regionX, regionY, new Uint8Array(message, lodOffset + 8, 768));
					lodOffset += 776;
				}
				break;
			}

			case oc.chunkBatch: { // Get many chunks in one message
				var batchCount = dv.getUint16(1, true);
				var batchOffset = 3;
				for (var b = 0; b < batchCount; b++) {
					var partLen = dv.getUint16(batchOffset, true);
					batchOffset += 2;
					this.processChunkPacket(message, batchOffset, partLen);
					batchOffset += partLen;
				}
				break;
			}

			case oc.teleport: // Teleport
				let x = dv.getInt32(1, true);
				let y = dv.getInt32(5, true);
				eventSys.emit(e.net.world.teleported, x, y);
				break;

			case oc.setRank: // new rank
				networkRankVerification[0] = dv.getUint8(1);
				eventSys.emit(e.net.sec.rank, dv.getUint8(1));
				break;

			case oc.captcha: // Captcha
				switch (dv.getUint8(1)) {
					case captchaState.CA_WAITING:
						// the ws sometimes closes while doing the captcha, showing
						// the reconnect screen afterwards, making the user redo it
						if(this.captcha) {
							let message = OldProtocol.misc.tokenVerification + this.captcha;
							this.ws.send(message);
						} else {
							loadAndRequestCaptcha();
							eventSys.once(e.misc.captchaToken, token => {
								let message = OldProtocol.misc.tokenVerification + token;
								if(this.ws.readyState != WebSocket.OPEN) {
									setTimeout(function() {
										retryingConnect(() => options.serverAddress[0], this.worldName, token);
									}, 125);
								} else {
									this.ws.send(message);
								}
							});
						}
						break;

					case captchaState.CA_OK:
					   this.worldName = this.joinWorld(this.worldName);
					   break;
				}
				break;

			case oc.setPQuota:
				let rate = dv.getUint16(1, true);
				let per = dv.getUint16(3, true);
				let oallownc = this.placeBucket.allowance;
				let pmult = dv.byteLength >= 6 ? dv.getUint8(5) / 10 : 1;
				this.placeBucket = new Bucket(rate, per);
				this.placeBucket.allowance = oallownc;
				this.placeBucketMult = pmult;
				eventSys.emit(e.net.donUntil, this.donUntilTs, this.placeBucketMult);
				break;

			case oc.chunkProtected:
				let cx = dv.getInt32(1, true);
				let cy = dv.getInt32(5, true);
				let newState = dv.getUint8(9);
				eventSys.emit(e.net.chunk.lock, cx, cy, newState);
				break;

			case oc.maxCount:
				eventSys.emit(e.net.maxCount, dv.getUint16(1, true));
				break;

			case oc.donUntil:
				this.donUntilTs = dv.getUint32(5, true) * Math.pow(2, 32) + dv.getUint32(1, true);
				eventSys.emit(e.net.donUntil, this.donUntilTs, this.placeBucketMult);
				break;
		}
	}

	joinWorld(name) {
		var nstr = stoi(name, OldProtocol.maxWorldNameLength);
		eventSys.emit(e.net.world.joining, name);
		var array = new ArrayBuffer(nstr[0].length + 2);
		var dv = new DataView(array);
		for (var i = nstr[0].length; i--;) {
			dv.setUint8(i, nstr[0][i]);
		}
		dv.setUint16(nstr[0].length, OldProtocol.misc.worldVerification, true);
		this.ws.send(array);
		return nstr[1];
	}

	/* Decodes one chunk packet. `offset`/`length` let this read a packet embedded in a
	   batch message as well as a standalone one, so both paths share this code. */
	processChunkPacket(buffer, offset, length) {
		var dv = new DataView(buffer, offset, length);
		var chunkX = dv.getInt32(1, true);
		var chunkY = dv.getInt32(5, true);
		var locked = dv.getUint8(9);
		var u8data = new Uint8Array(buffer, offset + 10, length - 10);
		var key = `${chunkX},${chunkY}`;
		/* Single pass straight to pixels - no intermediate byte array to allocate and
		   re-walk, which is the difference between one and two allocations per chunk. */
		var u32data = decompressToU32(u8data, new Uint32Array(OldProtocol.chunkSize * OldProtocol.chunkSize));
		this.lastChunkTime = Date.now();
		if (this.chunksLoading[key]) {
			delete this.chunksLoading[key];
			if (--this.waitingForChunks == 0) {
				clearTimeout(this.clet);
				this.clet = setTimeout(() => {
					eventSys.emit(e.net.chunk.allLoaded);
				}, 100);
			}
			eventSys.emit(e.net.chunk.load, new Chunk(chunkX, chunkY, u32data, locked));
			return;
		}
		/* Not marked in flight. If we already hold this chunk it really is an update
		   (a paste or erase), so let chunk.set run and show its effect. If we don't
		   hold it, this is just chunk data we didn't expect - adopt it as a plain load
		   rather than dropping it, and without the paste effect firing. */
		var held = misc.world ? misc.world.chunks[key] : null;
		if (held) {
			/* A redundant redelivery carries pixels we already have. Emitting chunk.set
			   for it would repaint the chunk and fire the paste fade for no visible
			   change, so only treat it as an update if something actually differs. */
			if (!held.matches(u32data)) {
				eventSys.emit(e.net.chunk.set, chunkX, chunkY, u32data);
			}
		} else {
			eventSys.emit(e.net.chunk.load, new Chunk(chunkX, chunkY, u32data, locked));
		}
	}

	requestChunk(x, y) {
		let wb = OldProtocol.worldBorder;
		var key = `${x},${y}`;
		if (x > wb || y > wb || x < ~wb || y < ~wb || this.chunksLoading[key]) {
			return;
		}
		this.chunksLoading[key] = Date.now(); /* timestamp so stale requests can expire */
		this.waitingForChunks++;
		var array = new ArrayBuffer(8);
		var dv = new DataView(array);
		dv.setInt32(0, x, true);
		dv.setInt32(4, y, true);
		this.ws.send(array);
	}

	/* Asks for coarse previews of a rectangle of regions. One 16-byte packet covers the
	   whole rectangle; large rectangles are split into horizontal bands to stay under
	   the server's per-request region cap. */
	requestRegionLod(regionX, regionY, width, height) {
		if (width <= 0 || height <= 0) {
			return;
		}
		var maxRegions = OldProtocol.maxLodRegionsPerRequest;
		var bandHeight = Math.max(1, Math.floor(maxRegions / width));
		for (var y = 0; y < height; y += bandHeight) {
			var h = Math.min(bandHeight, height - y);
			var array = new ArrayBuffer(16);
			var dv = new DataView(array);
			dv.setUint16(0, OldProtocol.regionLodGuard, true);
			dv.setUint16(2, 0, true); /* reserved */
			dv.setInt32(4, regionX, true);
			dv.setInt32(8, regionY + y, true);
			dv.setUint16(12, width, true);
			dv.setUint16(14, h, true);
			this.ws.send(array);
		}
	}

	/* Requests many chunks with a single packet instead of one packet each.
	   `coords` is a flat [x0, y0, x1, y1, ...] array; already-pending and
	   out-of-bounds chunks are dropped here so the server never sees them. */
	requestChunks(coords) {
		let wb = OldProtocol.worldBorder;
		var wanted = [];
		/* Expire in-flight requests that never got an answer. Without this a single
		   lost chunk is a permanent hole: the chunk is absent from the world so it
		   keeps getting picked up as missing, but chunksLoading still claims it is
		   on its way, so it is filtered out and never asked for again. */
		var now = Date.now();
		if (now - this.lastChunkTime > OldProtocol.chunkStallTimeout) {
			/* Only sweep when nothing has arrived for a while. A big load legitimately
			   keeps chunks queued for seconds, and sweeping during one would re-request
			   chunks that are simply still on their way. */
			for (var stale in this.chunksLoading) {
				if (now - this.chunksLoading[stale] > OldProtocol.chunkRequestTimeout) {
					delete this.chunksLoading[stale];
					if (this.waitingForChunks > 0) {
						this.waitingForChunks--;
					}
				}
			}
		}
		/* Keep only a bounded number of chunks in flight. Zoomed far out one screen can
		   be tens of thousands of chunks and tens of megabytes, taking many seconds to
		   stream; committing to all of it up front means the server keeps sending chunks
		   for where the camera used to be. `coords` arrives nearest-first, so truncating
		   here keeps the part actually being looked at and the rest is picked up by a
		   later scan as chunks land. */
		var budget = OldProtocol.maxInFlightChunks - this.waitingForChunks;
		var truncated = false;
		for (var i = 0; i < coords.length; i += 2) {
			var x = coords[i];
			var y = coords[i + 1];
			var key = `${x},${y}`;
			if (x > wb || y > wb || x < ~wb || y < ~wb || this.chunksLoading[key]) {
				continue;
			}
			if (budget <= 0) {
				truncated = true;
				break;
			}
			budget--;
			/* Must be a timestamp, not `true` - the sweep above subtracts this from
			   Date.now(), and `true` coerces to 1, making every entry look ancient. */
			this.chunksLoading[key] = now;
			this.waitingForChunks++;
			wanted.push(x, y);
		}
		if (!wanted.length) {
			return !truncated;
		}
		/* A single chunk is cheaper to send through the original 8-byte packet. */
		if (wanted.length === 2) {
			var single = new ArrayBuffer(8);
			var sdv = new DataView(single);
			sdv.setInt32(0, wanted[0], true);
			sdv.setInt32(4, wanted[1], true);
			this.ws.send(single);
			return !truncated;
		}
		var max = OldProtocol.maxChunkBatchCount;
		for (var sent = 0; sent < wanted.length; sent += max * 2) {
			var count = Math.min(max, (wanted.length - sent) / 2);
			var array = new ArrayBuffer(6 + count * 8);
			var dv = new DataView(array);
			dv.setUint16(0, OldProtocol.chunkBatchGuard, true);
			dv.setUint16(2, count, true);
			dv.setUint16(4, 0, true); /* reserved */
			for (var j = 0; j < count; j++) {
				dv.setInt32(6 + j * 8, wanted[sent + j * 2], true);
				dv.setInt32(6 + j * 8 + 4, wanted[sent + j * 2 + 1], true);
			}
			this.ws.send(array);
		}
		return !truncated;
	}

	allChunksLoaded() {
		return this.waitingForChunks === 0;
	}

	updatePixel(x, y, rgb, undocb) {
		var distx = Math.floor(x / OldProtocol.chunkSize) - Math.floor(this.lastSentX / (OldProtocol.chunkSize * 16)); distx *= distx;
		var disty = Math.floor(y / OldProtocol.chunkSize) - Math.floor(this.lastSentY / (OldProtocol.chunkSize * 16)); disty *= disty;
		var dist = Math.sqrt(distx + disty);
		if (this.isConnected() && (dist < 4 || player.rank == RANK.ADMIN) && this.placeBucket.canSpend(1)) {
			var array = new ArrayBuffer(11);
			var dv = new DataView(array);
			dv.setInt32(0,  x, true);
			dv.setInt32(4,  y, true);
			dv.setUint8(8, rgb[0]);
			dv.setUint8(9, rgb[1]);
			dv.setUint8(10, rgb[2]);
			this.ws.send(array);
			let key = `${x},${y}`;
			if (this.pendingEdits[key]) {
				clearTimeout(this.pendingEdits[key]);
			}
			this.pendingEdits[key] = setTimeout(undocb, 2000);
			return true;
		}
		return false;
	}

	sendUpdates() {
		var worldx = mouse.worldX;
		var worldy = mouse.worldY;
		var lastx = this.lastSentX;
		var lasty = this.lastSentY;
		if (this.isConnected() && shouldUpdate() || (worldx != lastx || worldy != lasty)) {
			var selrgb = player.selectedColor;
			this.lastSentX = worldx;
			this.lastSentY = worldy;
			// Send mouse position
			var array = new ArrayBuffer(12);
			var dv = new DataView(array);
			dv.setInt32(0, worldx, true);
			dv.setInt32(4, worldy, true);
			dv.setUint8(8, selrgb[0]);
			dv.setUint8(9, selrgb[1]);
			dv.setUint8(10, selrgb[2]);
			var tool = player.tool;
			var toolId = tool !== null ? +OldProtocol.tools.id[tool.id] : 0;
			dv.setUint8(11, toolId);
			this.ws.send(array);
		}
	}

	sendMessage(str) {
		if (str.length && this.id !== null) {
			if (player.rank == RANK.ADMIN || this.chatBucket.canSpend(1)) {
				this.ws.send(str + OldProtocol.misc.chatVerification);
				return true;
			} else {
				eventSys.emit(e.net.chat, JSON.stringify({
					sender: 'server',
					type: 'error',
					data:{
						message: "Slow down! You're talking too fast!"
					}
				}));
				return false;
			}
		}
	}

	protectChunk(x, y, newState) {
		if (this.isConnected() && player.rank > RANK.USER) {
			var array = new ArrayBuffer(10);
			var dv = new DataView(array);
			dv.setInt32(0, x, true);
			dv.setInt32(4, y, true);
			dv.setUint8(8, newState);
			this.ws.send(array);
			eventSys.emit(e.net.chunk.lock, x, y, newState, true);
		}
	}

	setChunk(x, y, data) {
		if (!(player.rank == RANK.ADMIN || (player.rank == RANK.MODERATOR && this.placeBucket.canSpend(1.25)))) {
			return false;
		}

		var buf = new Uint8Array(8 + OldProtocol.chunkSize * OldProtocol.chunkSize * 3);
		var dv = new DataView(buf.buffer);
		dv.setInt32(0, x, true);
		dv.setInt32(4, y, true);
		for (var i = 0, b = 8; i < data.length; i++, b += 3) {
			buf[b] = data[i] & 0xFF;
			buf[b + 1] = data[i] >> 8 & 0xFF;
			buf[b + 2] = data[i] >> 16 & 0xFF;
		}
		this.ws.send(buf.buffer);
		return true;
	}

	clearChunk(x, y, rgb) {
		if (player.rank == RANK.ADMIN || (player.rank == RANK.MODERATOR && this.placeBucket.canSpend(1))) {
			var array = new ArrayBuffer(13);
			var dv = new DataView(array);
			dv.setInt32(0, x, true);
			dv.setInt32(4, y, true);
			dv.setUint8(8, rgb[0]);
			dv.setUint8(9, rgb[1]);
			dv.setUint8(10, rgb[2]);
			this.ws.send(array);
			return true;
		}
		return false;
	}
}

OldProtocol.class = OldProtocolImpl;

PublicAPI.Protocol = OldProtocolImpl;
PublicAPI.OldProtocol = OldProtocol;
PublicAPI.captchaState = captchaState;