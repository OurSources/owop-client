/*
 * TODO:
 *   Mabye bookmarks
 *   IE support by adding .cur cursors
 */

var WorldOfPixels = WorldOfPixels || {};

WorldOfPixels.options = {
	serverAddress: "ws://ourworldofpixels.com:443", // The server address that websockets connect to
	fps: 30, // Fps used if requestAnimationFrame is not supported (not used atm)
	netUpdateSpeed: 20, // How many times per second to send updates to server
	tickSpeed: 30, // How many times per second to run a tick
	movementSpeed: 32,
	defaultZoom: 16,
	zoomStrength: 1,
	zoomLimitMin: 2,
	zoomLimitMax: 32
};

// This fixes modulo to work on negative numbers (-1 % 16 = 15)
Number.prototype.mod = function(n) {
	return ((this % n) + n) % n;
};

function colorToHtml(clr) {
	clr = clr.toString(16);
	return "#" + ('000000' + clr).substring(clr.length);
}

function drawtext(ctx, str, x, y, centered){
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

WorldOfPixels.keysDown = {};

WorldOfPixels.mouse = {
	x: 0,
	y: 0,
	lastX: 0,
	lastY: 0,
	worldX: 0,
	worldY: 0,
	lastWorldX: 0,
	lastWorldY: 0,
	validClick: false,
	validTile: false,
	insideViewport: true,
	touches: []
};


WorldOfPixels.camera = {
	x: 0,
	y: 0,
	zoom: WorldOfPixels.options.defaultZoom
};

WorldOfPixels.unloadFarChunks = function() { /* Slow? */
	var camx = this.camera.x;
	var camy = this.camera.y;
	var zoom = this.camera.zoom;
	var camw = window.innerWidth / zoom | 0;
	var camh = window.innerHeight / zoom | 0;
	var ctrx = camx + camw / 2;
	var ctry = camy + camh / 2;
	var delay = 0;
	for(var c in this.chunks) {
		c = this.chunks[c];
		if(!this.isVisible(c.x * 16, c.y * 16, 16, 16)) {
			var dx = Math.abs(ctrx / 16 - c.x) | 0;
			var dy = Math.abs(ctry / 16 - c.y) | 0;
			var dist = dx + dy;
			//console.log(dist);
			if(dist > 200) {
				setTimeout(function(c) {//
					c.remove();
				}, ++delay, c);
			}
		}
		
	}
}.bind(WorldOfPixels);

WorldOfPixels.updateCamera = function() {
	var time = this.renderer.time;
	if(time - this.lastCleanup > 1000) {
		this.lastCleanup = time;
		this.unloadFarChunks();
	}

	var zoom = this.camera.zoom;
	var alignedX = (this.camera.x * zoom | 0) / zoom;
	var alignedY = (this.camera.y * zoom | 0) / zoom;
	this.camera.x = alignedX;
	this.camera.y = alignedY;

	var x = alignedX / 16 - 2 | 0;
	var mx = alignedX / 16 + window.innerWidth / zoom / 16 + 1 | 0;
	var cy = alignedY / 16 - 2 | 0;
	var my = alignedY / 16 + window.innerHeight / zoom / 16 + 1 | 0;
	while(++x <= mx) {
		var y = cy;
		while(++y <= my) {
			if(!this.chunks[x + ',' + y]) {
				this.loadChunk(x, y);
			}
		}
	}

	this.renderer.oncameramove();

	document.getElementById("viewport").style.transform = "scale(" + zoom + ") translate(" + (-alignedX) + "px," + (-alignedY) + "px)";
	document.body.style.backgroundPosition = (-this.camera.x * zoom & 0xF) + "px " + (-this.camera.y * zoom & 0xF) + "px";
};



WorldOfPixels.getPixel = function(x, y) {
	var fl     = Math.floor;
	var key    = [fl(x / 16), fl(y / 16)].join();
	var pixelX = x & 0xF;
	var pixelY = y & 0xF;
	if(key in this.chunks) {
		var clr = this.chunks[key].u32data[pixelY * 16 + pixelX];
		return [clr & 0xFF, clr >> 8 & 0xFF, clr >> 16 & 0xFF];
	}
	return null;
}.bind(WorldOfPixels);

WorldOfPixels.isVisible = function(x, y, w, h) {
	var cx    = this.camera.x;
	var cy    = this.camera.y;
	var czoom = this.camera.zoom;
	var cw    = window.innerWidth;
	var ch    = window.innerHeight;
	return x + w >= cx && y + h >= cy &&
	       x <= cx + cw / czoom && y <= cy + ch / czoom;
}.bind(WorldOfPixels);



WorldOfPixels.chunks = {};

WorldOfPixels.chunksLoading = {};


/* int32, int32, Uint8Array */
function Chunk(x, y, data) {
	this.needsRedraw = false;
	this.x = x;
	this.y = y;
	this.canvas = document.createElement("canvas");
	this.context = this.canvas.getContext("2d");
	this.canvas.width = 16;
	this.canvas.height = 16;
	this.data = this.context.createImageData(16, 16);
	this.u32data = new Uint32Array(this.data.data.buffer);
	for(var i = 0, n = 0; i < data.length; i += 3, n++) {
		this.u32data[n] = 0xFF000000 | data[i + 2] << 16
		                | data[i + 1] << 8
		                | data[i];
	}
	this.draw();
}

Chunk.prototype.draw = function() {
	this.needsRedraw = false;
	this.context.putImageData(this.data, 0, 0);
};

Chunk.prototype.update = function(x, y, color) {
	this.u32data[y * 16 + x] = 0xFF000000 | color;
	this.needsRedraw = true;
};

Chunk.prototype.remove = function() {
	this.canvas.width = 0; /* Frees some memory */
	delete WorldOfPixels.chunks[[this.x, this.y]];
	WorldOfPixels.renderer.onchunkunload(this);
};

WorldOfPixels.isConnected = function() {
	return this.net.connection && this.net.connection.readyState === WebSocket.OPEN;
}.bind(WorldOfPixels);

WorldOfPixels.loadChunk = function(x, y) {
	var key = [x, y].join();
	if(this.isConnected() && !this.chunksLoading[key]) {
		this.net.requestChunk(x, y);
		this.chunksLoading[key] = true;
	}
};


WorldOfPixels.chatMessage = function(text) {
	var message = document.createElement("li");
	var span = document.createElement("span");
	if(this.options.oldserver) {
		text = text.replace(/&/g, '&amp;')
		      .replace(/</g, '&lt;')
		      .replace(/>/g, '&gt;')
		      .replace(/\"/g, '&quot;')
		      .replace(/\'/g, '&#39;')
		      .replace(/\//g, '&#x2F;');
	}
	span.innerHTML = text;
	message.appendChild(span);
	document.getElementById("chat-messages").appendChild(message);
	document.getElementById("chat-messages").scrollTop = document.getElementById("chat-messages").scrollHeight;
}.bind(WorldOfPixels);

WorldOfPixels.devChatMessage = function(text) {
	var message = document.createElement("li");
	var span = document.createElement("span");
	span.innerHTML = text;
	message.appendChild(span);
	document.getElementById("dev-chat-messages").appendChild(message);
	document.getElementById("dev-chat-messages").scrollTop = document.getElementById("dev-chat-messages").scrollHeight;
};


WorldOfPixels.tick = function() {
	var cameraMoved = false;
	if (this.keysDown[38]) { // Up
		this.camera.y -= this.options.movementSpeed / this.options.tickSpeed;
		cameraMoved = true;
	}
	if (this.keysDown[37]) { // Left
		this.camera.x -= this.options.movementSpeed / this.options.tickSpeed;
		cameraMoved = true;
	}
	if (this.keysDown[40]) { // Down
		this.camera.y += this.options.movementSpeed / this.options.tickSpeed;
		cameraMoved = true;
	}
	if (this.keysDown[39]) { // Right
		this.camera.x += this.options.movementSpeed / this.options.tickSpeed;
		cameraMoved = true;
	}
	if (cameraMoved) {
		this.movedMouse(this.mouse.x, this.mouse.y, 0);
		this.updateCamera();
	}
}.bind(WorldOfPixels);


WorldOfPixels.resize = function() {
	this.renderer.onresize();
	this.updateCamera();
}.bind(WorldOfPixels);

WorldOfPixels.validMousePos = function(tileX, tileY) {
	return this.mouse.insideViewport && this.getPixel(tileX, tileY) !== null;
}.bind(WorldOfPixels);

WorldOfPixels.movedMouse = function(x, y, btns) {
	this.mouse.x = x;
	this.mouse.y = y;
	this.mouse.worldX = this.camera.x * 16 + this.mouse.x / (this.camera.zoom / 16);
	this.mouse.worldY = this.camera.y * 16 + this.mouse.y / (this.camera.zoom / 16);
	
	var tileX   = Math.floor(this.mouse.worldX / 16);
	var tileY   = Math.floor(this.mouse.worldY / 16);
	
	if (this.updateClientFx()) {
		document.getElementById("xy-display").innerHTML = "X: " + tileX + ", Y: " + tileY;
	}
	
	if (btns !== 0 && this.mouse.validClick) {
		this.tools[this.toolSelected].click(x, y, btns, true);
	}
}.bind(WorldOfPixels);

WorldOfPixels.updateClientFx = function(force) {
	var fxtileX = this.clientFx.x;
	var fxtileY = this.clientFx.y;
	var tileX   = Math.floor(this.mouse.worldX / 16);
	var tileY   = Math.floor(this.mouse.worldY / 16);
	var rgb = this.palette[this.paletteIndex];
	    rgb = rgb[0] << 16 | rgb[1] << 8 | rgb[2];
	var tool = this.tools[this.toolSelected];
	if(fxtileX !== tileX || fxtileY !== tileY || force) {
		var valid = this.validMousePos(tileX, tileY);
		if(valid) {
			this.clientFx.update(tool.fxType, tileX, tileY, {color: rgb});
		} else {
			this.clientFx.update(-1, tileX, tileY, {color: rgb});
		}
		this.renderer.requestRender(1);
		return true;
	}
	return false;
}.bind(WorldOfPixels);

WorldOfPixels.openChat = function() {
	document.getElementById("chat").className = "active selectable";
	document.getElementById("dev-chat").className = "active selectable";
};

WorldOfPixels.closeChat = function() {
	document.getElementById("chat").className = "";
	document.getElementById("dev-chat").className = "";
};

WorldOfPixels.init = function() {
	if (window.location.hostname.indexOf("cursors.me") != -1 ||
		window.location.hostname.indexOf("yourworldofpixels.com") != -1) {
		// Redirects to the main url if played on an alternative url.
		window.location.href = "http://www.ourworldofpixels.com/";
		return;
	}

	/* Multi Browser Support */
	window.requestAnimationFrame =
		window.requestAnimationFrame ||
		window.mozRequestAnimationFrame ||
		window.webkitRequestAnimationFrame ||
		window.msRequestAnimationFrame ||
		function(f) {
			setTimeout(f, 1000 / this.options.fps);
		};

	if (typeof Uint8Array.prototype.join === "undefined") {
		Uint8Array.prototype.join = function(e) {
			if(typeof e === "undefined"){
				e = ',';
			} else if(typeof e !== "string"){
				e = e.toString();
			}
			var str = "";
			var i = 0;
			do {
				str += this[i] + e;
			} while(++i < this.length - 1);
			return str + this[i];
		};
	}

	this.clientFx = new Fx(-1, 0, 0, {color: 0});
	this.lastColor = [0, 0, 0];

	this.lastCleanup = 0;

	var viewport = document.getElementById("viewport");
	var chatinput = document.getElementById("chat-input");
	var devchat = document.getElementById("dev-chat");

	viewport.addEventListener("mouseenter", function() {
		this.mouse.insideViewport = true;
		this.updateClientFx(true);
	}.bind(this));
	viewport.addEventListener("mouseleave", function() {
		this.mouse.insideViewport = false;
		this.updateClientFx(true);
	}.bind(this));

	chatinput.addEventListener("keyup", function(event) {
		if(event.keyCode == 13) {
			this.blur();
			WorldOfPixels.net.sendMessage(this.value);
			this.value = '';
			WorldOfPixels.closeChat();
			event.stopPropagation();
		}
	});
	chatinput.addEventListener("focus", function(event) {
		if(!WorldOfPixels.mouse.validClick) {
			WorldOfPixels.openChat();
		} else {
			this.blur();
		}
	});
	chatinput.addEventListener("blur", function() {
		//this();
	}.bind(this.closeChat));

	window.addEventListener("resize", this.resize);
	window.addEventListener("keydown", function(event) {
		var keyCode = event.which || event.keyCode;
		if (document.activeElement != document.getElementById("chat-input")) {
			this.keysDown[keyCode] = true;
			if (keyCode == 16) {
				this.selectTool(1);
			} else if (event.ctrlKey && keyCode == 90 && this.undoHistory.length) {
				var undo = this.undoHistory.pop();
				if(!this.net.updatePixel(undo[0], undo[1], undo[2])) {
					this.undoHistory.push(undo);
				}
				event.preventDefault();
				return false; /* Strangely prevents chat from opening */
			}
		}
	}.bind(this));
	window.addEventListener("keyup", function(event) {
		var keyCode = event.which || event.keyCode;
		if (document.activeElement != document.getElementById("chat-input")) {
			delete this.keysDown[keyCode];
			if (keyCode == 13) {
				document.getElementById("chat-input").focus();
			} else if (keyCode == 16) {
				this.selectTool(0);
			}
		}
	}.bind(this));
	viewport.addEventListener("mousedown", function(event) {
		this.mouse.lastX = this.mouse.x;
		this.mouse.lastY = this.mouse.y;
		this.mouse.x = event.pageX;
		this.mouse.y = event.pageY;
		this.mouse.validClick = true;

		this.tools[this.toolSelected].click(event.pageX, event.pageY, event.buttons, false);
	}.bind(this));
	window.addEventListener("mouseup", function(event) {
		this.mouse.validClick = false;
	}.bind(this));

	window.addEventListener("mousemove", function(event) {
		this.movedMouse(event.pageX, event.pageY, event.buttons);
	}.bind(this));

	viewport.oncontextmenu = function() { return false; };
	viewport.addEventListener("mousewheel", function(event) {
		if (event.deltaY > 0) {
			this.paletteIndex++;
		} else {
			this.paletteIndex--;
		}
		this.paletteIndex = this.paletteIndex.mod(this.palette.length);
		this.changedColor();
	}.bind(this));
	
	// Touch support
	viewport.addEventListener("touchstart", function(event) {
		this.tools[this.toolSelected].touch(event.changedTouches, 0);
		
		event.preventDefault();
	}.bind(this));
	window.addEventListener("touchmove", function(event) {
		this.tools[this.toolSelected].touch(event.changedTouches, 1);
		
		event.preventDefault();
	}.bind(this));
	window.addEventListener("touchend", function(event) {
		this.tools[this.toolSelected].touch(event.changedTouches, 2);
		
		event.preventDefault();
	}.bind(this));
	window.addEventListener("touchcancel", function(event) {
		this.tools[this.toolSelected].touch(event.changedTouches, 3);
		
		event.preventDefault();
	}.bind(this));
	
	// Some cool custom css
	console.log("%c" +
		" _ _ _         _   _    _____ ___    _____ _         _     \n" +
		"| | | |___ ___| |_| |  |     |  _|  |  _  |_|_ _ ___| |___ \n" +
		"| | | | . |  _| | . |  |  |  |  _|  |   __| |_'_| -_| |_ -|\n" +
		"|_____|___|_| |_|___|  |_____|_|    |__|  |_|_,_|___|_|___|",
		"font-size: 15px; font-weight: bold;"
	);
	console.log("%cWelcome to the developer console!", "font-size: 20px; font-weight: bold; color: #F0F;");

	this.updateToolbar();

	this.camera.x = -(window.innerWidth / this.camera.zoom / 2);
	this.camera.y = -(window.innerHeight / this.camera.zoom / 2);
	this.renderer.init();

	this.updatePalette();

	/* TODO: make this better lol */
	var wm = WorldOfPixels.windowsys;
	var wdow = new GUIWindow(wm, 0, 0, 250, 65, "Select a server", {});
	wm.centerWindow(wdow);
	//wm.setScale(2);
	var btn = new GUIButton(wdow, 5, 5, 240, 25, {txt: "Original server"});
	var btn2 = new GUIButton(wdow, 5, 35, 240, 25, {txt: "Beta server"});
	wdow.elements.push(btn);
	wdow.elements.push(btn2);
	btn.onclick = function() {
		this.w.options.serverAddress = "ws://ourworldofpixels.com:443";
		this.w.net.connect();
		this.win.wm.delWindow(this.win);
		this.w.options.oldserver = true;
	}.bind({w:this,win:wdow});
	btn2.onclick = function() {
		this.w.options.serverAddress = "ws://vanillaplay.ddns.net:25565";
		this.w.net.connect();
		this.win.wm.delWindow(this.win);
	}.bind({w:this,win:wdow});
	wm.addWindow(wdow);
	wm.requestRender();

	//this.net.connect();

	this.tickInterval = setInterval(this.tick, 1000 / this.options.tickSpeed);
}.bind(WorldOfPixels);

window.addEventListener("load", function() {
	var remaining = 2;
	var onload = function() {
		if(--remaining == 0) {
			WorldOfPixels.tools.load();
			WorldOfPixels.init();
		}
	};
	WorldOfPixels.cursors.init(onload);
	WorldOfPixels.windowsys.init(onload);
});
