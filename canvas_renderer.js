var WorldOfPixels = WorldOfPixels || {};
WorldOfPixels.renderer = {
	time: 0,
	updaterequired: 3,
	animcanvas: null,
	animcontext: null,
	clusterdiv: null,
	clusters: {},
	visiblechunks: []
};

function ChunkCluster(x, y) {
	this.shown = false; /* is in document? */
	this.x = x;
	this.y = y;
	this.canvas = document.createElement("canvas");
	this.canvas.width = 16 * 64;
	this.canvas.height = 16 * 64;
	this.ctx = this.canvas.getContext("2d");
	this.chunks = [];
	this.canvas.style.transform = "translate(" + (x * 64 * 16) + "px," + (y * 64 * 16) + "px)";
}

ChunkCluster.prototype.render = function() {
	var offx = this.x * 64;
	var offy = this.y * 64;
	for(var i = this.chunks.length; i--;) {
		var c = this.chunks[i];
		if(c.needsRedraw) {
			c.draw();
			this.ctx.drawImage(c.canvas, (c.x - offx) * 16, (c.y - offy) * 16);
		}
	}
};

ChunkCluster.prototype.remove = function() {
	if(this.shown) {
		this.shown = false;
		document.getElementById("clusters").removeChild(this.canvas);
	}
	this.canvas.width = 0;
	this.chunks.length = 0;
	delete WorldOfPixels.renderer.clusters[[this.x, this.y]];
};

ChunkCluster.prototype.addChunk = function(chunk) {
	this.chunks.push(chunk);
	var offx = this.x * 64;
	var offy = this.y * 64;
	this.ctx.drawImage(chunk.canvas, (chunk.x - offx) * 16, (chunk.y - offy) * 16);
};

ChunkCluster.prototype.delChunk = function(chunk) {
	/* There is no real need to clearRect the chunk area */
	var i = this.chunks.indexOf(chunk);
	if(i !== -1) {
		this.chunks.splice(i, 1);
	}
	if(!this.chunks.length) {
		this.remove();
	}
};

WorldOfPixels.renderer.render = function(type) {
	var time = this.renderer.time = Date.now();
	var needsRender = 0; /* If an animation didn't finish, render again */
	if(type & 2) {
		var clusters = this.renderer.clusters;
		for(var c in clusters) {
			c = clusters[c];
			if(c.shown) {
				c.render();
			}
		}
	}
	if(type & 1) {
		var ctx = this.renderer.animcontext;
		ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
		var fx = this.fx;
		var render = this.renderer.renderFx;
		ctx.lineWidth = 2.5 / 16 * this.camera.zoom;
		for(var i = 0; i < fx.length; i++) {
			needsRender |= render(fx[i]) ? 0 : 1;
		}
		ctx.globalAlpha = 1;
		for(var p in this.net.players) {
			needsRender |= this.net.players[p].render() ? 0 : 1;
		}
	}
	this.renderer.requestRender(needsRender);
}.bind(WorldOfPixels);

WorldOfPixels.renderer.renderFx = function(fx) { /* Move this to Fx proto maybe */
	var camx = this.camera.x;
	var camy = this.camera.y;
	var context = this.renderer.animcontext;
	var cnvs = context.canvas;
	var time = this.renderer.time;
	var zoom = this.camera.zoom;
	var fl = Math.floor;

	var fxx = fl(fx.x * zoom) - camx * zoom;
	var fxy = fl(fx.y * zoom) - camy * zoom;

	if((fxx < -zoom || fxy < -zoom
	|| fxx > cnvs.width || fxy > cnvs.height) && fx.type != 3) {
		return true; /* Finished rendering */
	}

	switch(fx.type) {
		case 0: /* Only used for the local client */
			context.globalAlpha = 0.8;
			context.strokeStyle = fx.options.colorhex;
			context.strokeRect(fxx, fxy, zoom, zoom);
			break;
		case 1:
			var alpha = 1 - (time - fx.options.time) / 1000;
			if(alpha <= 0) {
				fx.delete();
				break;
			}
			context.globalAlpha = alpha;
			context.strokeStyle = fx.options.colorhex;
			context.strokeRect(fxx, fxy, zoom, zoom);
			return false;
			break;
		case 3:
			var alpha = 1 - (time - fx.options.time) / 1000;
			if(alpha <= 0) {
				fx.delete();
				break;
			}
			context.globalAlpha = alpha;
			context.strokeStyle = fx.options.colorhex;
			context.strokeRect((fl(fx.x / 16) * 16 - camx) * zoom,
			                   (fl(fx.y / 16) * 16 - camy) * zoom,
			                   zoom * 16, zoom * 16);
			return false;
			break;
	}
	return true;
}.bind(WorldOfPixels);

WorldOfPixels.renderer.requestRender = function(type) {
	this.updaterequired |= type;
}.bind(WorldOfPixels.renderer);

WorldOfPixels.renderer.updateVisible = function() {
	var clusters = this.renderer.clusters;
	var clusterdiv = this.renderer.clusterdiv;
	for(var c in clusters) {
		c = clusters[c];
		var visible = this.isVisible(c.x * 64 * 16, c.y * 64 * 16, 64 * 16, 64 * 16);
		if(!visible && c.shown) {
			c.shown = false;
			clusterdiv.removeChild(c.canvas);
		} else if(visible && !c.shown) {
			c.shown = true;
			clusterdiv.appendChild(c.canvas);
			this.renderer.requestRender(2);
		}
	}
}.bind(WorldOfPixels);

WorldOfPixels.renderer.oncameramove = function() {
	this.updateVisible();
	this.requestRender(1);
}.bind(WorldOfPixels.renderer);

WorldOfPixels.renderer.onchunkload = function(chunk) {
	var clusterX = Math.floor(chunk.x / 64);
	var clusterY = Math.floor(chunk.y / 64);
	var key = [clusterX, clusterY].join();
	var clusters = this.clusters;
	var cluster = clusters[key];
	if(!cluster) {
		cluster = clusters[key] = new ChunkCluster(clusterX, clusterY);
		this.updateVisible();
	}
	cluster.addChunk(chunk);
	this.requestRender();
}.bind(WorldOfPixels.renderer);

WorldOfPixels.renderer.onchunkunload = function(chunk) {
	var clusterX = Math.floor(chunk.x / 64);
	var clusterY = Math.floor(chunk.y / 64);
	var key = [clusterX, clusterY].join();
	var clusters = this.clusters;
	var cluster = clusters[key];
	if(cluster) {
		cluster.delChunk(chunk);
	}
};

WorldOfPixels.renderer.onresize = function() {
	if(this.animcanvas !== null) {
		this.animcanvas.width = window.innerWidth;
		this.animcanvas.height = window.innerHeight;
		this.animcontext.imageSmoothingEnabled = false;
	}
}.bind(WorldOfPixels.renderer);

WorldOfPixels.renderer.init = function() {
	this.clusterdiv = document.getElementById("clusters");
	this.animcanvas = document.getElementById("animations");
	this.animcontext = this.animcanvas.getContext("2d");
	this.onresize();
	var self = this;
	function frameLoop() {
		if(self.updaterequired) {
			var type = self.updaterequired;
			self.updaterequired = 0;
			self.render(type);
		}
		window.requestAnimationFrame(frameLoop);
	}
	frameLoop();
}.bind(WorldOfPixels.renderer);
