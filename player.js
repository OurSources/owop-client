var WorldOfPixels = WorldOfPixels || {};
WorldOfPixels.player = {};
WorldOfPixels.player.tools = [];

ToolCursor = {
	img: "cursor.png"
};

ToolCursor.click = function(button){
	
};

WorldOfPixels.player.tools.push(ToolCursor); /* Tool 0 */

ToolMove = {
	img: "move.png"
};

ToolMove.click = function(button){
	
};

WorldOfPixels.player.tools.push(ToolMove); /* Tool 1 */

ToolPipette = {
	img: "pipette.png"
};

ToolPipette.click = function(button){
	
};

WorldOfPixels.player.tools.push(ToolPipette); /* Tool 2 */

ToolEraser = {
	img: "erase.png"
};

ToolEraser.click = function(button){
	
};

WorldOfPixels.player.tools.push(ToolEraser); /* Tool 3 */

function Player(x, y, r, g, b, tool, id) {
  this.x = x;
  this.y = y
  this.r = r;
  this.g = g;
  this.b = b;
  this.tool = WorldOfPixels.player.tools[tool];
  this.element = document.createElement("div");
  this.img = document.createElement("img");
  this.img.src = this.tool.img;
  var idElement = document.createElement("span");
  idElement.innerHTML = id;
  idElement.style.backgroundColor = "rgb(" + (((id + 75387) * 67283 + 53143) % 256) + ", " + (((id + 9283) * 4673 + 7483) % 256) + ", " + (id * 3000 % 256) + ")";
  this.element.appendChild(this.img);
  this.element.appendChild(idElement);
  this.element.style.transform = "translate(" + x + "px," + y + "px)";
  this.element.className = "cursor";
  document.getElementById("cursors").appendChild(this.element);
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
  if(tool != this.tool){
    this.tool = WorldOfPixels.player.tools[tool];
    this.img.src = this.tool.img;
  }
  this.element.style.transform = "translate(" + x + "px," + y + "px)";
};

Player.prototype.disconnect = function() {
  document.getElementById("cursors").removeChild(this.element);
};
