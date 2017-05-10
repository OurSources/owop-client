var WorldOfPixels = WorldOfPixels || {};
WorldOfPixels.net = {
	playercount: 1
};

function Bucket(rate, time) {
	this.allowance = rate;
	this.rate = rate;
	this.time = time;
	this.lastCheck = Date.now();
}

Bucket.prototype.canSpend = function(count) {
	this.allowance += (Date.now() - this.lastCheck) / 1000 * (this.rate / this.time);
	this.lastCheck = Date.now();
	if (this.allowance > this.rate) {
		this.allowance = this.rate;
	}
	if (this.allowance < count) {
		return false;
	}
	this.allowance -= count;
	return true;
};

WorldOfPixels.net.updatePlayerCount = function() {
	document.getElementById("playercount-display").innerHTML = this.playercount + " cursors online";
}.bind(WorldOfPixels.net);

WorldOfPixels.net.stoi = function(string, max) {
	var ints = [];
	var fstring = "";
	string = string.toLowerCase();
	for (var i=0; i<string.length && i<max; i++) {
		var charCode = string.charCodeAt(i);
		if((charCode < 123 && charCode > 96) || (charCode < 58 && charCode > 47) || charCode == 95 || charCode == 46){
			fstring += String.fromCharCode(charCode);
			ints.push(charCode);
		}
	}
	return [ints, fstring];
};

WorldOfPixels.net.joinWorld = function(worldName) {
	var nstr = this.net.stoi(worldName, 24);
	var array = new ArrayBuffer(nstr[0].length + 2);
	var dv = new DataView(array);
	for(var i = nstr[0].length; i--;){
		dv.setUint8(i, nstr[0][i]);
	}
	dv.setUint16(nstr[0].length, 1337, true);
	this.net.connection.send(array);
	return nstr[1];
}.bind(WorldOfPixels);

WorldOfPixels.net.requestChunk = function(x, y) {
	if (x > 0xFFFFF || y > 0xFFFFF || x < ~0xFFFFF || y < ~0xFFFFF) {
		return;
	}
	var array = new ArrayBuffer(8);
	var dv = new DataView(array);
	dv.setInt32(0, x, true);
	dv.setInt32(4, y, true);
	this.net.connection.send(array);
}.bind(WorldOfPixels);

WorldOfPixels.net.updatePixel = function(x, y, color) {
	var fl = Math.floor;
	var key = fl(x / 16) + ',' + fl(y / 16);
	var chunk = this.chunks[key];
	var rgb = color[2] << 16 | color[1] << 8 | color[0];
	var crgb = this.getPixel(x, y);
	if (chunk && crgb !== rgb && this.net.placeBucket.canSpend(1)) {
		chunk.update(x & 0xF, y & 0xF, rgb);
		var array = new ArrayBuffer(11);
		var dv = new DataView(array);
		dv.setInt32(0,  x, true);
	  	dv.setInt32(4,  y, true);
	  	dv.setUint8(8,  rgb       & 0xFF);
	  	dv.setUint8(9,  rgb >> 8  & 0xFF);
	  	dv.setUint8(10, rgb >> 16 & 0xFF);
	  	this.net.connection.send(array);
		this.renderer.requestRender(2); /* Request world re-render */
		return true;
	}
	return false;
}.bind(WorldOfPixels);

WorldOfPixels.net.sendUpdates = function() {
	var worldx = this.mouse.worldX;
	var worldy = this.mouse.worldY;
	var lastx = this.mouse.lastWorldX;
	var lasty = this.mouse.lastWorldY;
	var selrgb = this.palette[this.paletteIndex];
	selrgb = selrgb[0] << 16 | selrgb[1] << 8 | selrgb[2];
	var oldrgb = this.lastColor;
	oldrgb = oldrgb[0] << 16 | oldrgb[1] << 8 | oldrgb[2];
	if (worldx != lastx || worldy != lasty || this.toolSelected != this.lastTool || selrgb != oldrgb) {
		this.mouse.lastWorldX = worldx;
		this.mouse.lastWorldY = worldy;
		this.lastTool = this.toolSelected;
		this.lastColor = this.palette[this.paletteIndex];
		// Send mouse position
		var array = new ArrayBuffer(12);
		var dv = new DataView(array);
		dv.setInt32(0, worldx, true);
		dv.setInt32(4, worldy, true);
		dv.setUint8(8, this.palette[this.paletteIndex][0]);
		dv.setUint8(9, this.palette[this.paletteIndex][1]);
		dv.setUint8(10, this.palette[this.paletteIndex][2]);
		dv.setUint8(11, this.toolSelected);
		this.net.connection.send(array);
	}
}.bind(WorldOfPixels);

WorldOfPixels.net.sendMessage = function(message) {
	if (message.length) {
		if (this.net.chatBucket.canSpend(1)) {
			this.net.connection.send(message + String.fromCharCode(10));
		} else {
			this.chatMessage("Slow down! You're talking too fast!");
		}
	}
}.bind(WorldOfPixels);

WorldOfPixels.net.connect = function() {
	this.net.connection = new WebSocket(this.options.serverAddress);
	this.net.connection.binaryType = "arraybuffer";

	this.net.connection.onopen = function() {
		this.net.placeBucket = new Bucket(32, 4);
		this.net.chatBucket = new Bucket(4, 6);

		this.net.worldName = decodeURIComponent(window.location.pathname).replace(/\/public(?:\/)/g, "");
		if (this.net.worldName === "") {
			this.net.worldName = "main";
		}
		this.net.worldName = "main";
		var worldName = this.net.joinWorld(this.net.worldName);
		console.log("Connected! Joining world: " + worldName);
	
		this.updateCamera();
	
		this.net.updateInterval = setInterval(this.net.sendUpdates, 1000 / this.options.netUpdateSpeed);
	}.bind(this);

	this.net.connection.onmessage = function(message) {
		var fl = Math.floor;
		var time = this.renderer.time = Date.now();
		message = message.data;
		if(typeof message === "string"){
			console.log(message);
			if (message.indexOf("DEV") == 0){
				this.devChatMessage(message.slice(3));
			} else {
				this.chatMessage(message);
			}
			return;
		}
		var dv = new DataView(message);
		switch(dv.getUint8(0)) {
			case 0: // Get id
				this.net.id = dv.getUint32(1, true);
				this.net.players = {};
				console.log("ID:", this.net.id);
				if(this.options.oldserver) {
					this.chatMessage("[Server] Joined world: \"" + this.net.worldName + "\", your ID is: " + this.net.id + "!");
				}
				break;
			case 1: // Get all cursors, tile updates, disconnects
				var shouldrender = 0;
				// Cursors
				for(var i = dv.getUint8(1); i--;){
  					var pid = dv.getUint32(2 + i * 16, true);
	  				var pmx = dv.getInt32(2 + i * 16 + 4, true);
	  				var pmy = dv.getInt32(2 + i * 16 + 8, true);
	  				var pr = dv.getUint8(2 + i * 16 + 12);
	  				var pg = dv.getUint8(2 + i * 16 + 13);
	  				var pb = dv.getUint8(2 + i * 16 + 14);
	  				var ptool = dv.getUint8(2 + i * 16 + 15);
					/* buffer.putInt(rgb << 8 | (p.getTool() & 0xFF)); */
					var player = this.net.players[pid];
	  				if(player) {
	  					player.update(pmx, pmy, pr, pg, pb, ptool, time);
	  				} else if(pid !== this.net.id) {
						++this.net.playercount;
						this.net.updatePlayerCount();
	  					this.net.players[pid] = new Player(pmx, pmy, pr, pg, pb, ptool, pid);
	  				}
					if(this.isVisible(pmx / 16, pmy / 16, 4, 4)
					|| (player && this.isVisible(player.x / 16, player.y / 16, 4, 4))) {
						shouldrender |= 1; /* Re-render players and fx */
					}
	  			}
	  			var off = 2 + dv.getUint8(1) * 16;
	  			// Tile updates
	  			for(var j = dv.getUint16(off, true); j--;){
	  				var bpx = dv.getInt32(2 + off + j * 11, true);
	  				var bpy = dv.getInt32(2 + off + j * 11 + 4, true);
	  				var br = dv.getUint8(2 + off + j * 11 + 8);
	  				var bg = dv.getUint8(2 + off + j * 11 + 9);
	  				var bb = dv.getUint8(2 + off + j * 11 + 10);
					var brgb = br << 16 | bg << 8 | bb;
					var bbgr = bb << 16 | bg << 8 | br;
					/* Just check for the whole chunk */
	  				if(this.isVisible(bpx, bpy, 1, 1)) {
						shouldrender |= 3; /* Chunks, players, fx */
						new Fx(1, bpx, bpy, {color: brgb ^ 0xFFFFFF, time: time});
	  				}
					var key = fl(bpx / 16) + ',' + fl(bpy / 16);
					var chunk = this.chunks[key];
	  				if (chunk) {
						shouldrender |= 2;
	  					chunk.update(bpx & 0xF, bpy & 0xF, bbgr);
	  				}
	  			}
	  			off += dv.getUint16(off, true) * 11 + 2;
	  			// Disconnects
	  			for(var k = dv.getUint8(off); k--;){
	  				var dpid = dv.getUint32(1 + off + k * 4, true);
					var player = this.net.players[dpid];
	  				if(player){
						if(this.isVisible(player.nx / 16, player.ny / 16, 4, 4)) {
							shouldrender |= 1;
						}
	  					player.disconnect();
						if(this.net.playercount > 0) {
							--this.net.playercount;
							this.net.updatePlayerCount();
						}
	  				}
					delete this.net.players[dpid];
	  			}
				if(shouldrender) {
					this.renderer.requestRender(shouldrender);
				}
				break;
			case 2: // Get chunk
				var chunkX = dv.getInt32(1, true);
				var chunkY = dv.getInt32(5, true);
				var u8data = new Uint8Array(message, 9, 16 * 16 * 3);
				var key = [chunkX, chunkY].join();
				var chunk = this.chunks[key];
				if (!this.chunksLoading[key] && chunk) {
					// If chunk was not requested, show eraser fx
					new Fx(3, chunkX * 16, chunkY * 16, {time: time});
					for (var n = 0; n < 16 * 16; n++) {
						chunk.u32data[n] = 0xFFFFFFFF;
						chunk.draw();
					}
				} else {
					delete this.chunksLoading[key];
					var chunk = this.chunks[key] = new Chunk(chunkX, chunkY, u8data);
					this.renderer.onchunkload(chunk);
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
				document.getElementById("dev-chat").style.display = "";
				break;
		}
	}.bind(this);

	this.net.connection.onclose = function() {
		clearInterval(this.net.updateInterval);
		console.log("Disconnected from server");
		this.chatMessage("[Server] You were disconnected from the server!");
	}.bind(this);
}.bind(WorldOfPixels);
