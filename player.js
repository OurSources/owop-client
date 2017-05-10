var WorldOfPixels = WorldOfPixels || {};
WorldOfPixels.tools = [];
WorldOfPixels.toolSelected = 0;
WorldOfPixels.lastTool = 0;
WorldOfPixels.paletteIndex = 0;
WorldOfPixels.palette = [[0, 0, 0], [0, 0, 255], [0, 255, 0], [255, 0, 0]];
WorldOfPixels.undoHistory = [];

WorldOfPixels.isAdmin = false;

WorldOfPixels.changedColor = function() {
	this.updateClientFx(true);
	this.updatePaletteIndex();
}.bind(WorldOfPixels);

WorldOfPixels.updatePalette = function() {
	document.getElementById("palette-colors").innerHTML = "";
	var colorClick = function(index) {
		return function() {
			this.paletteIndex = index;
			this.updatePaletteIndex();
		}.bind(this);
	}.bind(this);
	for (var i = 0; i < this.palette.length; i++) {
		var element = document.createElement("div");
		element.style.backgroundColor = "rgb(" + this.palette[i][0] + ", " + this.palette[i][1] + ", " + this.palette[i][2] + ")";
		element.onclick = colorClick(i);
		document.getElementById("palette-colors").appendChild(element);
	}
	this.updatePaletteIndex();
}.bind(WorldOfPixels);

WorldOfPixels.updatePaletteIndex = function() {
	document.getElementById("palette-colors").style.transform = "translateY(" + (-this.paletteIndex * 40) + "px)";
}.bind(WorldOfPixels);

WorldOfPixels.addPaletteColor = function(color) {
	for (var i=0; i<this.palette.length; i++) {
		if (this.palette[i][0] == color[0] && this.palette[i][1] == color[1] && this.palette[i][2] == color[2]) {
			this.paletteIndex = i;
			this.updatePaletteIndex();
			return;
		}
	}
	this.paletteIndex = this.palette.length;
	this.palette.push(new Uint8Array(color));
	this.updatePalette();
}.bind(WorldOfPixels);



WorldOfPixels.updateToolbar = function() {
	function toolButtonClick(id) {
		return function(event) {
			WorldOfPixels.selectTool(id);
			event.stopPropagation();
		};
	};
	
	document.getElementById("tool-select").innerHTML = "";
	
	// Add tools to the tool-select menu
	for (var i=0; i<this.tools.length; i++) {
		if (!this.tools[i].adminTool || this.isAdmin) {
			var element = document.createElement("button");
			element.id = "tool-" + i;
			element.appendChild(this.tools[i].icon);
			element.addEventListener("click", toolButtonClick(i));
			element.addEventListener("touchstart", toolButtonClick(i));
			element.addEventListener("touchend", toolButtonClick(i));
			if (i == this.toolSelected) {
				element.className = "selected";
				document.getElementById("viewport").style.cursor = "url(" + this.tools[this.toolSelected].cursorblob + ") 0 0, pointer";
			}
			document.getElementById("tool-select").appendChild(element);
		}
	}
};

function Tool(cursor, fxType, isAdminTool, onclick, onTouch, onSelect) {
	this.fxType = fxType;
	this.cursorblob = cursor.img.shadowblob;
	this.cursor = cursor.img.shadowed;
	this.icon = cursor.img.original;
	this.slot = cursor.img.slot;
	this.offset = cursor.hotspot;
	this.adminTool = isAdminTool;
	this.click = onclick;
	this.touch = onTouch;
	this.select = onSelect;
}

WorldOfPixels.tools.load = function() {
	delete this.tools.load;
	// Cursor tool
	this.tools.push(
		new Tool(this.cursors.cursor, 0, false,
			function(x, y, buttons, isDrag) {
				var tileX = Math.floor(this.camera.x + (x / this.camera.zoom));
				var tileY = Math.floor(this.camera.y + (y / this.camera.zoom));
				
				var pixel = this.getPixel(tileX, tileY);
				if (buttons == 1) {
					if (pixel[0] !== this.palette[this.paletteIndex][0] || pixel[1] !== this.palette[this.paletteIndex][1] || pixel[2] !== this.palette[this.paletteIndex][2]) {
						this.undoHistory.push([tileX, tileY, [pixel[0], pixel[1], pixel[2]]]);
						this.net.updatePixel(tileX, tileY, this.palette[this.paletteIndex]);
					}
				} else if (buttons == 2) {
					if (pixel[0] !== 255 || pixel[1] !== 255 || pixel[2] !== 255) {
						this.undoHistory.push([tileX, tileY, [pixel[0], pixel[1], pixel[2]]]);
						this.net.updatePixel(tileX, tileY, [255, 255, 255]);
					}
				} else if (buttons == 4) {
					this.addPaletteColor(this.getPixel(tileX, tileY));
				}
			}.bind(this),
			function(touches, type) {
				var averageX = 0;
				var averageY = 0;
				for (var i=0; i<touches.length; i++) {
					var tileX = Math.floor(this.camera.x + (touches[i].pageX / this.camera.zoom));
					var tileY = Math.floor(this.camera.y + (touches[i].pageY / this.camera.zoom));
					
					averageX += this.camera.x + (touches[i].pageX / this.camera.zoom);
					averageY += this.camera.y + (touches[i].pageY / this.camera.zoom);
					
					var pixel = this.getPixel(tileX, tileY);
					if (pixel[0] !== this.palette[this.paletteIndex][0] || pixel[1] !== this.palette[this.paletteIndex][1] || pixel[2] !== this.palette[this.paletteIndex][2]) {
						this.undoHistory.push([tileX, tileY, [pixel[0], pixel[1], pixel[2]]]);
						this.net.updatePixel(tileX, tileY, this.palette[this.paletteIndex]);
					}
				}
				this.mouse.x = (averageX / touches.length - this.camera.x) * 16;
				this.mouse.y = (averageY / touches.length - this.camera.y) * 16;
			}.bind(this),
			function() {}
		)
	);
	
	// Move tool
	this.tools.push(
		new Tool(this.cursors.move, -1, false,
			function(x, y, button, isDrag) {
				if (!isDrag) {
					this.startX = this.camera.x + (x / this.camera.zoom);
					this.startY = this.camera.y + (y / this.camera.zoom);
				} else {
					this.camera.x = this.startX - (x / this.camera.zoom);
					this.camera.y = this.startY - (y / this.camera.zoom);
					this.updateCamera();
				}
			}.bind(this),
			function(touches, type) {
				if (type === 0) {
					this.startX = this.camera.x + (touches[0].pageX / this.camera.zoom);
					this.startY = this.camera.y + (touches[0].pageY / this.camera.zoom);
				} else {
					this.camera.x = this.startX - (touches[0].pageX / this.camera.zoom);
					this.camera.y = this.startY - (touches[0].pageY / this.camera.zoom);
					this.updateCamera();
				}
				this.mouse.x = (touches[0].pageX - this.camera.x) * 16;
				this.mouse.y = (touches[0].pageY - this.camera.y) * 16;
			}.bind(this),
			function() {}
		)
	);
	
	// Pipette tool
	this.tools.push(
		new Tool(this.cursors.pipette, -1, false,
			function(x, y, buttons, isDrag) {
				var tileX = Math.floor(this.camera.x + (x / this.camera.zoom));
				var tileY = Math.floor(this.camera.y + (y / this.camera.zoom));
				
				this.addPaletteColor(this.getPixel(tileX, tileY));
			}.bind(this),
			function(touches, type) {
				for (var i=0; i<touches.length; i++) {
					var tileX = Math.floor(this.camera.x + (touches[i].pageX / this.camera.zoom));
					var tileY = Math.floor(this.camera.y + (touches[i].pageY / this.camera.zoom));
					
					this.addPaletteColor(this.getPixel(tileX, tileY));
				}
			}.bind(this),
			function() {}
		)
	);
	
	// Erase/Fill tool
	this.tools.push(
		new Tool(this.cursors.fill, 3, true,
			function(x, y, buttons, isDrag) {
				var chunkX = Math.floor((this.camera.x + (x / this.camera.zoom)) / 16);
				var chunkY = Math.floor((this.camera.y + (y / this.camera.zoom)) / 16);
				
				var clear = false;
				for(var i=16*16*3; i--;){
					if(this.chunks[[chunkX, chunkY]].data[i] != 255){
						clear = true;
						this.chunks[[chunkX, chunkY]].data[i] = 255;
					}
				}
				if(clear){
					this.chunks[[chunkX, chunkY]].draw();
					var array = new ArrayBuffer(9);
					var dv = new DataView(array);
					dv.setInt32(0, chunkX, true);
					dv.setInt32(4, chunkY, true);
					dv.setUint8(8, 0);
					this.net.connection.send(array);
				}
			}.bind(this),
			function(touches, type) {
				for (var i=0; i<touches.length; i++) {
					var chunkX = Math.floor((this.camera.x + (touches[i].pageX / this.camera.zoom)) / 16);
					var chunkY = Math.floor((this.camera.y + (touches[i].pageY / this.camera.zoom)) / 16);
					
					var clear = false;
					var chunk = this.chunks[[chunkX, chunkY]];
					if(!chunk) {
						continue;
					}
					for(var j = 16 * 16 * 3; j--;){
						if(chunk.u32data[j] != 0xFFFFFFFF){
							clear = true;
							chunk.u32data[j] = 0xFFFFFFFF;
						}
					}
					if(clear){
						chunk.draw();
						var array = new ArrayBuffer(9);
						var dv = new DataView(array);
						dv.setInt32(0, chunkX, true);
						dv.setInt32(4, chunkY, true);
						dv.setUint8(8, 0);
						this.net.connection.send(array);
					}
				}
			}.bind(this),
			function() {}
		)
	);
	
	// Zoom tool
	this.tools.push(
		new Tool(this.cursors.zoom, -1, false,
			function(x, y, buttons, isDrag, touches) {
				if (!isDrag) {
					var lzoom = this.camera.zoom;
					if (buttons == 1 && this.camera.zoom * (1 + this.options.zoomStrength) <= this.options.zoomLimitMax) {
						// Zoom in
						this.camera.zoom *= 1 + this.options.zoomStrength;
						this.camera.x += this.mouse.x / this.camera.zoom;
						this.camera.y += this.mouse.y / this.camera.zoom;
						this.updateCamera();
					} else if (buttons == 2 && this.camera.zoom / (1 + this.options.zoomStrength) >= this.options.zoomLimitMin) {
						// Zoom out
						this.camera.zoom /= 1 + this.options.zoomStrength;
						this.camera.x += this.mouse.x * (3 / lzoom - 2 / this.camera.zoom);
						this.camera.y += this.mouse.y * (3 / lzoom - 2 / this.camera.zoom);
						this.updateCamera();
					} else if (buttons == 3) {
						// Reset zoom (right + left click)
						this.camera.zoom = this.options.defaultZoom;
						this.updateCamera();
					}
				}
			}.bind(this),
			function(touches, type) {}.bind(this),
			function() {}
		)
	);
}.bind(WorldOfPixels);

WorldOfPixels.selectTool = function(id) {
	this.toolSelected = id;
	this.tools[id].select();
	var children = document.getElementById("tool-select").children;
	for (var i=0; i<children.length; i++) {
		children[i].className = "";
	}
	document.getElementById("tool-" + id).className = "selected";
	document.getElementById("viewport").style.cursor = "url(" + this.tools[id].cursorblob + ") " + this.tools[id].offset[0] + " " + this.tools[id].offset[1] + ", pointer";
	this.mouse.validClick = false;
	this.updateClientFx(true);
}.bind(WorldOfPixels);

function Player(x, y, r, g, b, tool, id) {
	this.id   = id;
	this.x    = this.nx = x;
	this.y    = this.ny = y;
	this.r    = r;
	this.g    = g;
	this.b    = b;
	this.tool = tool;

	this.t   = Date.now();

	this.clr = (((id + 75387) * 67283 + 53143) % 256) << 16
	         | (((id + 9283)  * 4673  + 7483)  % 256) << 8
	         | (  id * 3000                    % 256);
	this.clr = colorToHtml(this.clr);

	this.rgb    = r << 16 | g << 8 | b;
	this.rgbhex = colorToHtml(this.rgb);

	var fl = Math.floor;
	var toolfx = WorldOfPixels.tools[tool];
	toolfx = toolfx ? toolfx.fxType : -1;
	this.fx = new Fx(toolfx, fl(x / 16), fl(y / 16), {color: this.rgb});
}

Player.prototype.getX = function() {
	var inc = (WorldOfPixels.renderer.time - this.t) / 60;
	return this.x + (inc >= 1 ? 1 : inc) * (this.nx - this.x);
};

Player.prototype.getY = function() {
	var inc = (WorldOfPixels.renderer.time - this.t) / 60;
	return this.y + (inc >= 1 ? 1 : inc) * (this.ny - this.y);
};

Player.prototype.update = function(x, y, r, g, b, tool, t){
	this.x = this.nx;
	this.y = this.ny;
	this.nx = x;
	this.ny = y;
	this.r = r;
	this.g = g;
	this.b = b;
	this.tool = tool;
	this.t = t;
	this.rgb = r << 16 | g << 8 | b;
	var fl = Math.floor;
	var toolfx = WorldOfPixels.tools[tool];
	toolfx = toolfx ? toolfx.fxType : -1;
	this.fx.update(toolfx, fl(x / 16), fl(y / 16), {color: this.rgb});
};

/* Returns true if it should be rendered again */
Player.prototype.render = function() {
	var camx = WorldOfPixels.camera.x * 16;
	var camy = WorldOfPixels.camera.y * 16;
	var zoom = WorldOfPixels.camera.zoom;
	var ctx  = WorldOfPixels.renderer.animcontext;
	var cnvs = ctx.canvas;
	var tool = WorldOfPixels.tools[this.tool];
	if(!tool) {
		/* Render the default tool if the selected one isn't defined */
		tool = WorldOfPixels.tools[0];
	}
	var toolwidth = tool.cursor.width / 16 * zoom;
	var toolheight = tool.cursor.height / 16 * zoom;

	var x = this.getX();
	var y = this.getY();
	var cx = ((x - camx) - tool.offset[0]) * (zoom / 16) | 0;
	var cy = ((y - camy) - tool.offset[1]) * (zoom / 16) | 0;

	if(cx < -toolwidth || cy < -toolheight
	|| cx > cnvs.width || cy > cnvs.height) {
		return true;
	}

	var fontsize = 10 / 16 * zoom | 0;
	if(fontsize > 3) {
		var idstr = this.id.toString();
		var textw = ctx.measureText(idstr).width + (zoom / 2);
		
		ctx.font = fontsize + "px sans-serif";
		ctx.globalAlpha = 1;
		ctx.fillStyle = this.clr;
		ctx.fillRect(cx, cy + toolheight, textw, zoom);
		ctx.globalAlpha = 0.2;
		ctx.lineWidth = 3;
		ctx.strokeStyle = "#000000";
		ctx.strokeRect(cx, cy + toolheight, textw, zoom);
		ctx.globalAlpha = 1;
		drawtext(ctx, idstr, cx + zoom / 4, cy + fontsize + toolheight + zoom / 8);
	}

	ctx.drawImage(tool.cursor, cx, cy, toolwidth, toolheight);
	return x == this.nx;
};

Player.prototype.disconnect = function() {
	if (this.fx) {
		this.fx.delete();
	}
};
