WorldOfPixels = WorldOfPixels || {};
WorldOfPixels.fx = [];

function Fx(type, x, y, options) {
  this.type = type;
  this.x = x;
  this.y = y;
  this.options = options;
  this.element = document.createElement("div");
  this.element.className = "fx" + this.type;
  this.element.style.transform = "translate(" + this.x + "px, " + this.y + "px)";
  switch(this.type) {
    case 0:
      this.element.style.borderColor = "rgb(" + this.options.color[0] + "," + this.options.color[1] + "," + this.options.color[2] + ")";
      break;
    case 1:
      this.element.style.borderColor = "rgb(" + ((this.options.color >> 16) & 0xFF) + "," + ((this.options.color >> 8) & 0xFF) + "," + (this.options.color & 0xFF) + ")";
      setTimeout(function(){
        this.delete();
      }.bind(this), 1000);
      break;
    case 3:
      setTimeout(function(){
        this.delete();
      }.bind(this), 1000);
      break;
  }
  
  document.getElementById("fx").appendChild(this.element);
}

Fx.prototype.update = function(x, y, options) {
  this.x = x;
  this.y = y;
  this.options = options;
  this.element.style.transform = "translate(" + this.x + "px, " + this.y + "px)";
  switch(this.type) {
    case 0:
      this.element.style.borderColor = "rgb(" + this.options.color[0] + "," + this.options.color[1] + "," + this.options.color[2] + ")";
      break;
  }
};

Fx.prototype.delete = function() {
  this.element.parentNode.removeChild(this.element);
};