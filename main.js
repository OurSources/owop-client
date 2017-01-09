/*
 * TODO:
 *   Smooth mouse move transitions
 *   Scroll with middle mouse button
 *   Mabye bookmarks
 *   IE support by adding .cur cursors
 */

var WorldOfPixels = WorldOfPixels || {};

WorldOfPixels.options = {
  serverAddress: "ws://www.ourworldofpixels.com:443", // The server address that websockets connect to
  fps: 30, // Fps used if requestAnimationFrame is not supported
  netUpdateSpeed: 20, // How many times per second to send updates to server
  tickSpeed: 30, // How many times per second to run a tick
  movementSpeed: 32
};

// This fixes modulo to work on negative numbers (-1 % 16 = 15)
Number.prototype.mod = function(n) {
    return ((this%n)+n)%n;
};



WorldOfPixels.keysDown = [];

WorldOfPixels.mouse = {
  x: 0,
  y: 0,
  lastX: 0,
  lastY: 0,
  validClick: false
};


WorldOfPixels.camera = {
  x: -32,
  y: -32,
  zoom: 16
};

WorldOfPixels.updateCamera = function() {
  for (var i in this.chunks) {
    if (
      this.chunks[i].x < Math.floor(this.camera.x/16) - 1 ||
      this.chunks[i].x > this.camera.x/16 + window.innerWidth/this.camera.zoom/16 + 1 ||
      this.chunks[i].y < Math.floor(this.camera.y/16) - 1 ||
      this.chunks[i].y > this.camera.y/16 + window.innerHeight/this.camera.zoom/16 + 1
    ) {
      this.chunks[i].remove();
    }
  }
  for (var x=Math.floor(this.camera.x/16) - 1; x<this.camera.x/16 + window.innerWidth/this.camera.zoom/16 + 1; x++) {
    for (var y=Math.floor(this.camera.y/16) - 1; y<this.camera.y/16 + window.innerHeight/this.camera.zoom/16 + 1; y++) {
      if (!([x, y] in this.chunks)) {
        this.loadChunk(x, y);
      }
    }
  }
  
  /* Possible fix for subpixel (blurry) rendering: round the camera position? */

  document.getElementById("viewport").style.zoom = 100 * this.camera.zoom + "%";
  document.getElementById("viewport").style.left = -this.camera.x + "px";
  document.getElementById("viewport").style.top = -this.camera.y + "px";
  //document.getElementById("viewport").style.transform = "translate(" + (-Math.round(this.camera.x)) + "px," + (-Math.round(this.camera.y)) + "px)";
  document.body.style.backgroundPosition = -this.camera.x + "px " + -this.camera.y + "px";
};



WorldOfPixels.getPixel = function(x, y) {
  // NOTICE: Number.mod is modified! Check the top of the file ^
  if ([x >> 4, y >> 4].join() in this.chunks) {
    return this.chunks[[x >> 4, y >> 4]].data.slice((y.mod(16) * 16 + x.mod(16)) * 3, (y.mod(16) * 16 + x.mod(16) + 1) * 3);
  } else {
    return [255, 255, 255];
  }
}.bind(WorldOfPixels);

WorldOfPixels.isVisible = function(x, y, w, h) {
  return x + w >= this.camera.x && y + h >= this.camera.y &&
    x <= this.camera.x + window.innerWidth / this.camera.zoom && y <= this.camera.y + window.innerHeight / this.camera.zoom;
}.bind(WorldOfPixels);



WorldOfPixels.chunks = {};

WorldOfPixels.chunksLoading = [];

function Chunk(x, y, data) {
  this.loaded = false;
  this.x = x;
  this.y = y;
  this.data = data;
  this.canvas = document.createElement("canvas");
  this.canvas.width = 16;
  this.canvas.height = 16;
  this.canvas.style.left = this.x * 16 + "px";
  this.canvas.style.top = this.y * 16 + "px";
  this.draw();
  document.getElementById("chunks").appendChild(this.canvas);
  this.loaded = true;
}

Chunk.prototype.draw = function() {
  var ctx = this.canvas.getContext("2d");
  var imageData = ctx.getImageData(0, 0, 16, 16);
  for (var i=0; i<imageData.data.length/4; i++) {
    imageData.data[i * 4] = this.data[i * 3];
    imageData.data[i * 4 + 1] = this.data[i * 3 + 1];
    imageData.data[i * 4 + 2] = this.data[i * 3 + 2];
    imageData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
};

Chunk.prototype.update = function(x, y, color) {
  this.data[(y * 16 + x) * 3] = color[0];
  this.data[(y * 16 + x) * 3 + 1] = color[1];
  this.data[(y * 16 + x) * 3 + 2] = color[2];
  var ctx = this.canvas.getContext("2d");
  var imageData = ctx.createImageData(1, 1);
  imageData.data[0] = color[0];
  imageData.data[1] = color[1];
  imageData.data[2] = color[2];
  imageData.data[3] = 255;
  ctx.putImageData(imageData, x, y);
};

Chunk.prototype.remove = function() {
  this.canvas.parentNode.removeChild(this.canvas);
  delete WorldOfPixels.chunks[[this.x, this.y]];
};

WorldOfPixels.loadChunk = function(x, y) {
  if (this.net.connection && !this.chunksLoading.includes([x, y].join())) {
    this.net.requestChunk(x, y);
    this.chunksLoading.push([x, y].join());
  }
};


WorldOfPixels.chatMessage = function(text) {
  var message = document.createElement("li");
  var span = document.createElement("span");
  span.innerHTML = text;
  message.appendChild(span);
  document.getElementById("chat-messages").appendChild(message);
  document.getElementById("chat-messages").scrollTop = document.getElementById("chat-messages").scrollHeight;
};



WorldOfPixels.tick = function() {
  var cameraMoved = false;
  if (this.keysDown.includes(38)) { // Up
    this.camera.y -= this.options.movementSpeed / this.options.tickSpeed;
    cameraMoved = true;
  }
  if (this.keysDown.includes(37)) { // Left
    this.camera.x -= this.options.movementSpeed / this.options.tickSpeed;
    cameraMoved = true;
  }
  if (this.keysDown.includes(40)) { // Down
    this.camera.y += this.options.movementSpeed / this.options.tickSpeed;
    cameraMoved = true;
  }
  if (this.keysDown.includes(39)) { // Right
    this.camera.x += this.options.movementSpeed / this.options.tickSpeed;
    cameraMoved = true;
  }
  if (cameraMoved) {
    this.updateCamera();
  }
}.bind(WorldOfPixels);


WorldOfPixels.resize = function() {
  this.updateCamera();
}.bind(WorldOfPixels);

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
	
  this.clientFx = new Fx(0, 0, 0, {color: [0, 0, 0]});
  this.lastTool = 0;
  
  window.addEventListener("resize", this.resize);
  window.addEventListener("keydown", function(event) {
    var keyCode = event.which || event.keyCode;
    if (document.activeElement != document.getElementById("chat-input")) {
      if (!this.keysDown.includes(keyCode)) {
        this.keysDown.push(keyCode);
      }
    }
  }.bind(this));
  window.addEventListener("keyup", function(event) {
    var keyCode = event.which || event.keyCode;
    if (this.keysDown.includes(keyCode)) {
      this.keysDown.splice(this.keysDown.indexOf(keyCode), 1);
    }
    if (document.activeElement != document.getElementById("chat-input")) {
      if (keyCode == 13) {
        document.getElementById("chat-input").focus();
      }
    }
  }.bind(this));
  document.getElementById("viewport").addEventListener("mousedown", function(event) {
    this.mouse.lastX = this.camera.x * 16 + this.mouse.x;
    this.mouse.lastY = this.camera.y * 16 + this.mouse.y;
    this.mouse.x = event.pageX * 16 / this.camera.zoom;
    this.mouse.y = event.pageY * 16 / this.camera.zoom;
    this.mouse.validClick = true;
    document.body.className = "noselect";
    
    this.tools[this.toolSelected].click(event.pageX, event.pageY, event.buttons, false);
  }.bind(this));
  window.addEventListener("mousemove", function(event) {
    this.mouse.lastX = this.camera.x * 16 + this.mouse.x;
    this.mouse.lastY = this.camera.y * 16 + this.mouse.y;
    this.mouse.x = event.pageX * 16 / this.camera.zoom;
    this.mouse.y = event.pageY * 16 / this.camera.zoom;
    
    var tileX = Math.floor(this.camera.x + (event.pageX / this.camera.zoom));
    var tileY = Math.floor(this.camera.y + (event.pageY / this.camera.zoom));
    if (this.toolSelected != this.lastTool) {
      if (this.clientFx) {
        this.clientFx.delete();
      }
      this.clientFx = undefined;
      this.lastTool = this.toolSelected;
      switch(this.toolSelected) {
        case 0:
          this.clientFx = new Fx(0, tileX, tileY, {color: this.palette[this.paletteIndex]});
          break;
        case 3:
          this.clientFx = new Fx(2, Math.floor(tileX / 16) * 16, Math.floor(tileY / 16) * 16, {});
          break;
      }
    }
    if (this.clientFx) {
      switch(this.toolSelected) {
        case 0:
          this.clientFx.update(tileX, tileY, {color: this.palette[this.paletteIndex]});
          break;
        case 3:
          this.clientFx.update(Math.floor(tileX / 16) * 16, Math.floor(tileY / 16) * 16, {});
          break;
      }
    }
    
    if (event.buttons !== 0 && this.mouse.validClick) {
      this.tools[this.toolSelected].click(event.pageX, event.pageY, event.buttons, true);
    }
    document.getElementById("xy-display").innerHTML = "X: " + Math.floor(this.camera.x + (this.mouse.x / this.camera.zoom)) + ", Y: " + Math.floor(this.camera.y + (this.mouse.y / this.camera.zoom));
  }.bind(this));
  window.addEventListener("mouseup", function(event) {
    this.mouse.validClick = false;
    document.body.className = "";
  }.bind(this));
  document.getElementById("viewport").oncontextmenu = function(){return false;};
  document.getElementById("viewport").addEventListener("mousewheel", function(event) {
    if (event.deltaY > 0) {
      this.paletteIndex++;
    } else {
      this.paletteIndex--;
    }
    this.paletteIndex = this.paletteIndex.mod(this.palette.length);
    this.updatePaletteIndex();
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
  
  var toolButtonClick = function(id) {
    return function() {
      WorldOfPixels.toolSelected = id;
      for (var i=0; i<this.parentNode.children.length; i++) {
        this.parentNode.children[i].className = "";
      }
      this.className = "selected";
      document.getElementById("chunks").style.cursor = "url(" + WorldOfPixels.tools[WorldOfPixels.toolSelected].cursor + ") " + -WorldOfPixels.tools[WorldOfPixels.toolSelected].offset[0] + " " + -WorldOfPixels.tools[WorldOfPixels.toolSelected].offset[1] + ", pointer";
    };
  };
  
  // Add tools to the tool-select menu
  for (var i=0; i<this.tools.length; i++) {
    if (!this.tools[i].adminTool) {
      var element = document.createElement("button");
      var img = document.createElement("img");
      img.src = this.tools[i].icon;
      element.appendChild(img);
      element.addEventListener("click", toolButtonClick(i));
      if (i == this.toolSelected) {
        element.className = "selected";
        document.getElementById("chunks").style.cursor = "url(" + this.tools[this.toolSelected].cursor + ") 0 0, pointer";
      }
      document.getElementById("tool-select").appendChild(element);
    }
  }
  
  this.camera.x = -(window.innerWidth / this.camera.zoom / 2.5);
  this.camera.y = -(window.innerHeight / this.camera.zoom / 2.5);
  
  this.updatePalette();
  
  this.net.connect();
  
  this.tickInterval = setInterval(this.tick, 1000 / this.options.tickSpeed);
}.bind(WorldOfPixels);

window.addEventListener("load", WorldOfPixels.init);
