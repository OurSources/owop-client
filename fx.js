WorldOfPixels = WorldOfPixels || {};
WorldOfPixels.fx = [];

function Fx(type, x, y, options) {
	this.type = type;
	this.x = x;
	this.y = y;
	this.options = options;
	var clr = options.color;
	if(typeof clr !== "undefined") {
		this.options.colorhex = colorToHtml(clr);
	}
	WorldOfPixels.fx.push(this);
}

Fx.prototype.update = function(type, x, y, options) {
	this.type = type;
	this.x = x;
	this.y = y;
	if(typeof options.color === "undefined") {
		options.colorhex = "#000000";
	} else if(options.color !== this.options.color) {
		options.colorhex = colorToHtml(options.color);
	} else { /* if same color */
		return;
	}
	this.options = options;
};

Fx.prototype.delete = function() {
	var i = WorldOfPixels.fx.indexOf(this);
	if(i !== -1) {
		WorldOfPixels.fx.splice(i, 1);
	}
};
