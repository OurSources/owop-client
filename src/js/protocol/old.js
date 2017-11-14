'use strict';
import { Protocol } from './Protocol.js';
import { EVENTS as e, RANK, options } from './../conf.js';
import { eventSys } from './../global.js';
import { Chunk } from './../World.js';
import { Bucket } from './../util/Bucket.js';
import { loadAndRequestCaptcha } from './../captcha.js';
import { colorUtils as color } from './../util/color.js';
import { player, shouldUpdate } from './../local_player.js';
import { camera } from './../canvas_renderer.js';
import { mouse } from './../main.js';

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
    placeBucket: [32, 4],
    tools: {
        id: {}, /* Generated automatically */
        0: 'cursor',
        1: 'move',
        2: 'pipette',
        3: 'erase',
        4: 'zoom'
    },
    misc: {
        worldVerification: 1337,
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
            setAdmin: 4,
            captcha: 5
        }
    }
};

for (const id in OldProtocol.tools) {
    if (Number.isInteger(+id)) {
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
    constructor(ws, worldName) {
        super(ws);
        super.hookEvents(this);
        this.lastSentX = 0;
        this.lastSentY = 0;
        this.playercount = 1;
        this.worldName = worldName ? worldName : options.defaultWorld;
        this.players = {};
        this.chunksLoading = {}; /* duplicate */
        this.waitingForChunks = 0;
        this.id = null;

        var params = OldProtocol.chatBucket;
        this.chatBucket = new Bucket(params[0], params[1]);
        params = OldProtocol.placeBucket;
        this.placeBucket = new Bucket(params[0], params[1]);

        this.interval = null;

        this.joinFunc = () => {
            this.interval = setInterval(() => this.sendUpdates(), 1000 / OldProtocol.netUpdateSpeed);
        };

        eventSys.once(e.net.world.join, this.joinFunc);
    }

    closeHandler() {
        super.closeHandler();
        clearInterval(this.interval);
        eventSys.removeListener(e.net.world.join, this.joinFunc);
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
				eventSys.emit(e.net.chat, "[Server] Joined world: \"" + this.worldName + "\", your ID is: " + id + "!");
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
	  			for (var j = dv.getUint16(off, true); j--;) {
                    updated = true;
	  				var bpx = dv.getInt32(2 + off + j * 11, true);
	  				var bpy = dv.getInt32(2 + off + j * 11 + 4, true);
	  				var br = dv.getUint8(2 + off + j * 11 + 8);
	  				var bg = dv.getUint8(2 + off + j * 11 + 9);
	  				var bb = dv.getUint8(2 + off + j * 11 + 10);
                    var bbgr = bb << 16 | bg << 8 | br;
                    updates.push({
                        x: bpx,
                        y: bpy,
                        rgb: bbgr
                    });
                }
                if (updated) {
                    eventSys.emit(e.net.world.tilesUpdated, updates);
                }
	  			off += dv.getUint16(off, true) * 11 + 2;
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
				var chunkX = dv.getInt32(1, true);
				var chunkY = dv.getInt32(5, true);
                var u8data = new Uint8Array(message, 9, message.byteLength - 9);
                var key = `${chunkX},${chunkY}`;
                var u32data = new Uint32Array(OldProtocol.chunkSize * OldProtocol.chunkSize);
                for (var i = 0, u = 0; i < u8data.length; i += 3) { /* Need to make a copy ;-; */
                    var color = u8data[i + 2] << 16
                        | u8data[i + 1] << 8
                        | u8data[i]
                    u32data[u++] = 0xFF000000 | color;
                }
				if (!this.chunksLoading[key]) {
                    eventSys.emit(e.net.chunk.set, chunkX, chunkY, u32data);
				} else {
                    delete this.chunksLoading[key];
                    this.waitingForChunks--;
					var chunk = new Chunk(chunkX, chunkY, u32data);
					eventSys.emit(e.net.chunk.load, chunk);
				}
                break;
                
			case oc.teleport: // Teleport
				let x = dv.getInt32(1, true) - (window.innerWidth / camera.zoom / 2.5);
                let y = dv.getInt32(5, true) - (window.innerHeight / camera.zoom / 2.5);
                eventSys.emit(e.net.world.teleported, x, y);
                break;
                
            case oc.setAdmin: // Got admin
                eventSys.emit(e.net.sec.rank, RANK.ADMIN);
                break;
                
            case oc.captcha: // Captcha
                switch (dv.getUint8(1)) {
                    case captchaState.CA_WAITING:
                        loadAndRequestCaptcha();
                        eventSys.once(e.misc.captchaToken, token => {
                            let message = OldProtocol.misc.tokenVerification + token;
                            this.ws.send(message);
                        });
                        break;

                    case captchaState.CA_OK:
                       this.worldName = this.joinWorld(this.worldName);
                       break;
                }
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
        
    requestChunk(x, y) {
        let wb = OldProtocol.worldBorder;
        var key = `${x},${y}`;
        if (x > wb || y > wb || x < ~wb || y < ~wb || this.chunksLoading[key]) {
            return;
        }
        this.chunksLoading[key] = true;
        this.waitingForChunks++;
        var array = new ArrayBuffer(8);
        var dv = new DataView(array);
        dv.setInt32(0, x, true);
        dv.setInt32(4, y, true);
        this.ws.send(array);
    }

    allChunksLoaded() {
        return this.waitingForChunks === 0;
    }
        
    updatePixel(x, y, rgb) {
        if (this.isConnected() && this.placeBucket.canSpend(1)) {
            var array = new ArrayBuffer(11);
            var dv = new DataView(array);
            dv.setInt32(0,  x, true);
            dv.setInt32(4,  y, true);
            dv.setUint8(8, rgb[0]);
            dv.setUint8(9, rgb[1]);
            dv.setUint8(10, rgb[2]);
            this.ws.send(array);
            return true;
        }
        return false;
    }
        
    sendUpdates() {
        var worldx = mouse.worldX;
        var worldy = mouse.worldY;
        var lastx = this.lastSentX;
        var lasty = this.lastSentY;
        if (shouldUpdate() || (worldx != lastx || worldy != lasty)) {
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
            var toolId = tool !== null ? +OldProtocol.tools.id[tool.name] : 0;
            dv.setUint8(11, toolId);
            this.ws.send(array);
        }
    }
        
    sendMessage(str) {
        if (str.length && this.id !== null) {
            if (this.chatBucket.canSpend(1)) {
                this.ws.send(str + OldProtocol.misc.chatVerification);
                return true;
            } else {
                eventSys.emit(e.net.chat, "Slow down! You're talking too fast!");
                return false;
            }
        }
    }

    clearChunk(x, y) {
        var array = new ArrayBuffer(9);
        var dv = new DataView(array);
        dv.setInt32(0, x, true);
        dv.setInt32(4, y, true);
        this.ws.send(array);
    }
}

OldProtocol.class = OldProtocolImpl;
