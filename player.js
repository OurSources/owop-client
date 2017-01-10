var WorldOfPixels = WorldOfPixels || {};
WorldOfPixels.tools = [];
WorldOfPixels.toolSelected = 0;
WorldOfPixels.paletteIndex = 0;
WorldOfPixels.palette = [new Uint8Array([0, 0, 0]), new Uint8Array([255, 0, 0]), new Uint8Array([0, 255, 0]), new Uint8Array([0, 0, 255])];

WorldOfPixels.updatePalette = function() {
  document.getElementById("palette-colors").innerHTML = "";
  var colorClick = function(index) {
    return function() {
      this.paletteIndex = index;
      this.updatePaletteIndex();
    }.bind(this);
  }.bind(this);
  for (var i=0; i<WorldOfPixels.palette.length; i++) {
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



function Tool(cursor, icon, offset, isAdminTool, onclick) {
  this.cursor = cursor;
  this.icon = icon;
  this.offset = offset;
  this.adminTool = isAdminTool;
  this.click = onclick;
}

// Cursor tool
WorldOfPixels.tools.push(
  new Tool("cursor-default.png", "icon-cursor.png", [-1, -2], false, function(x, y, buttons, isDrag) {
    var tileX = Math.floor(this.camera.x + (x / this.camera.zoom));
    var tileY = Math.floor(this.camera.y + (y / this.camera.zoom));
    
    var pixel = this.getPixel(tileX, tileY);
    if (buttons == 1) {
      if (pixel[0] !== this.palette[this.paletteIndex][0] || pixel[1] !== this.palette[this.paletteIndex][1] || pixel[2] !== this.palette[this.paletteIndex][2]) {
        this.net.updatePixel(tileX, tileY, this.palette[this.paletteIndex]);
      }
    } else if (buttons == 2) {
      if (pixel[0] !== 255 || pixel[1] !== 255 || pixel[2] !== 255) {
        this.net.updatePixel(tileX, tileY, [255, 255, 255]);
      }
    }
  }.bind(WorldOfPixels))
);

// Move tool
WorldOfPixels.tools.push(
  new Tool("cursor-move.png", "icon-move.png", [-18, -20], false, function(x, y, button, isDrag) {
    if (!isDrag) {
      this.startX = WorldOfPixels.camera.x + (x / WorldOfPixels.camera.zoom);
      this.startY = WorldOfPixels.camera.y + (y / WorldOfPixels.camera.zoom);
    } else {
      WorldOfPixels.camera.x = this.startX - (x / WorldOfPixels.camera.zoom);
      WorldOfPixels.camera.y = this.startY - (y / WorldOfPixels.camera.zoom);
      WorldOfPixels.updateCamera();
    }
  })
);

// Pipette tool
WorldOfPixels.tools.push(
  new Tool("cursor-pipette.png", "icon-pipette.png", [-1, -30], false, function(x, y, buttons, isDrag) {
    var tileX = Math.floor(this.camera.x + (x / this.camera.zoom));
    var tileY = Math.floor(this.camera.y + (y / this.camera.zoom));
    
    this.addPaletteColor(this.getPixel(tileX, tileY));
  }.bind(WorldOfPixels))
);

// Erase/Fill tool
WorldOfPixels.tools.push(
  new Tool("cursor-erase.png", "icon-fill.png", [-7, -32], true, function(x, y, buttons, isDrag) {
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
  }.bind(WorldOfPixels))
);

// Zoom tool
WorldOfPixels.tools.push(
  new Tool(
    "https://cdn3.iconfinder.com/data/icons/watchify-v1-0-32px/32/magnifying-glass-search-32.png",
    "https://cdn3.iconfinder.com/data/icons/watchify-v1-0-32px/32/magnifying-glass-search-32.png",
    [0, 0], false, function(x, y, buttons, isDrag) {
      if (!isDrag) {
        if (buttons == 1 && this.camera.zoom * (1 + this.options.zoomStrength) <= this.options.zoomLimitMax) {
          // Zoom in
          this.camera.zoom *= 1 + this.options.zoomStrength;
          this.updateCamera();
        } else if (buttons == 2 && this.camera.zoom / (1 + this.options.zoomStrength) >= this.options.zoomLimitMin) {
          // Zoom out
          this.camera.zoom /= 1 + this.options.zoomStrength;
          this.updateCamera();
        } else if (buttons == 3) {
          // Reset zoom (right + left click)
          this.camera.zoom = this.options.defaultZoom;
          this.updateCamera();
        }
      }
    }.bind(WorldOfPixels))
);

function Player(x, y, r, g, b, tool, id) {
  this.x = x;
  this.y = y;
  this.r = r;
  this.g = g;
  this.b = b;
  this.tool = tool;
  this.id = id;
  if (this.id != WorldOfPixels.net.id) {
    switch(this.tool) {
      case 0:
        this.fx = new Fx(0, Math.floor(this.x / 16), Math.floor(this.y / 16), {color: [this.r, this.g, this.b]});
        break;
      case 3:
        this.fx = new Fx(2, Math.floor(this.x / 256) * 16, Math.floor(this.y / 256) * 16, {});
    }
    this.element = document.createElement("div");
    this.img = document.createElement("img");
    this.img.src = WorldOfPixels.tools[this.tool].cursor;
    this.img.style.left = WorldOfPixels.tools[this.tool].offset[0] + "px";
    this.img.style.top = WorldOfPixels.tools[this.tool].offset[1] + "px";
    var idElement = document.createElement("span");
    idElement.innerHTML = id;
    idElement.style.backgroundColor = "rgb(" + (((id + 75387) * 67283 + 53143) % 256) + ", " + (((id + 9283) * 4673 + 7483) % 256) + ", " + (id * 3000 % 256) + ")";
    idElement.style.transform = "translateY(" + (this.img.height + WorldOfPixels.tools[this.tool].offset[1]) + "px)";
    this.element.appendChild(this.img);
    this.element.appendChild(idElement);
    this.element.style.transform = "translate(" + x + "px," + y + "px)";
    this.element.className = "cursor";
    document.getElementById("cursors").appendChild(this.element);
  }
}

Player.prototype.getX = function() {
  return this.x;
};

Player.prototype.getY = function() {
  return this.y;
};

Player.prototype.update = function(x, y, r, g, b, tool) {
  this.x = x;
  this.y = y;
  this.r = r;
  this.g = g;
  this.b = b;
  if (this.id != WorldOfPixels.net.id) {
    if (this.fx) {
      switch(this.tool) {
        case 0:
          this.fx.update(Math.floor(this.x / 16), Math.floor(this.y / 16), {color: [this.r, this.g, this.b]});
          break;
        case 3:
          this.fx.update(Math.floor(this.x / 256) * 16, Math.floor(this.y / 256) * 16, {});
          break;
      }
    }
    this.element.style.transform = "translate(" + x + "px," + y + "px)";
    if(tool != this.tool){
      this.tool = tool;
      if (this.id != WorldOfPixels.net.id) {
        this.img.src = WorldOfPixels.tools[this.tool].cursor;
        this.img.style.left = WorldOfPixels.tools[this.tool].offset[0] + "px";
        this.img.style.top = WorldOfPixels.tools[this.tool].offset[1] + "px";
      }
      if (this.fx) {
        this.fx.delete();
      }
      switch(this.tool) {
        case 0:
          this.fx = new Fx(0, Math.floor(this.x / 16), Math.floor(this.y / 16), {color: [this.r, this.g, this.b]});
          break;
        case 1:
          this.fx = undefined;
          break;
        case 2:
          this.fx = undefined;
          break;
        case 3:
          this.fx = new Fx(2, Math.floor(this.x / 256) * 16, Math.floor(this.y / 256) * 16, {});
      }
    }
  }
};

Player.prototype.disconnect = function() {
  document.getElementById("cursors").removeChild(this.element);
  if (this.fx) {
    this.fx.delete();
  }
  delete WorldOfPixels.net.players[this.id];
};
