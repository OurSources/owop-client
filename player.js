var WorldOfPixels = WorldOfPixels || {};
WorldOfPixels.tools = [];

function Tool(img, onclick) {
  this.img = img;
  this.click = onclick;
}

// Cursor tool
WorldOfPixels.tools.push(
  new Tool("cursor.png", function(x, y, button) {
    
  })
);

// Move tool
WorldOfPixels.tools.push(
  new Tool("move.png", function(x, y, button) {
    
  })
);

// Pipette tool
WorldOfPixels.tools.push(
  new Tool("pipette.png", function(x, y, button) {
    
  })
);

// Erase tool
WorldOfPixels.tools.push(
  new Tool("erase.png", function(x, y, button) {
    
  })
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
    this.element = document.createElement("div");
    this.img = document.createElement("img");
    this.img.src = WorldOfPixels.tools[this.tool].img;
    var idElement = document.createElement("span");
    idElement.innerHTML = id;
    idElement.style.backgroundColor = "rgb(" + (((id + 75387) * 67283 + 53143) % 256) + ", " + (((id + 9283) * 4673 + 7483) % 256) + ", " + (id * 3000 % 256) + ")";
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
    if(tool != this.tool){
      this.img.src = WorldOfPixels.tools[this.tool].img;
    }
    this.element.style.transform = "translate(" + x + "px," + y + "px)";
  }
  this.tool = tool;
};

Player.prototype.disconnect = function() {
  document.getElementById("cursors").removeChild(this.element);
  delete WorldOfPixels.net.players[this.id];
};
