var uitex = new Image();
uitex.src = "/gui.png";
var alphatex = new Image();
alphatex.src = "/alphaascii.png";
/* Other chars in alphaextra.png, unused for now */
var txtbuf = document.createElement("canvas");
var txtctx = txtbuf.getContext("2d");

function rendertext(str, rgb){
	var lines = str.split('\n');
	var w = str.length * 8;
	var h = lines.length * 16;
	txtbuf.width = w;
	txtbuf.height = h;
	for(var i = 0; i < lines.length; ++i){
		for(var j = lines[i].length; j--;){
			var cc = lines[i].charCodeAt(j) - 33;
			if(cc >= 0 && cc < 94){
				txtctx.drawImage(alphatex, cc * 8, 0, 8, 16, j * 8, i * 16, 8, 16);
			}
		}
	}
	if(typeof rgb !== "undefined"){
		var imgdta = txtctx.getImageData(0, 0, w, h);
		for(var i = 0; i < imgdta.data.length; i += 4){
			if(imgdta.data[i + 3] != 255)
				continue;
			imgdta.data[i] = rgb[0];
			imgdta.data[i + 1] = rgb[1];
			imgdta.data[i + 2] = rgb[2];
		}
		txtctx.putImageData(imgdta, 0, 0);
	}
	return txtbuf;
}

function random(seed) {
    var x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

function GUITextbox(x, y, w, h, writable, text, invis){
	this.x = x || 0;
	this.y = y || 0;
	var ts = text.split('\n');
	var mw = w;
	for(var i = ts.length; i--;){
		if(ts[i].length * 8 > mw){
			mw = ts[i].length * 8;
		}
	}
	this.w = w || mw;
	this.h = h || ts.length * 16 - 5;
	this.writable = !!writable;
	this.text = text;
	this.invisible = !!invis;
}

GUITextbox.prototype.click = function(){
	if(this.writable){
		textfocus = this;
	}
};

GUITextbox.prototype.onkeypress = function(e){
	switch(e.keyCode){
		case 8:
			this.text = this.text.slice(0, -1);
			break;
		case 13:
			this.text = "";
			break;
	}
	if(e.charCode){
		this.text += String.fromCharCode(e.charCode);
	}
};

GUITextbox.prototype.render = function(win){
	if(!this.invisible){
		win.ctx.strokeStyle = "#000000";
		win.ctx.lineWidth = 1;
		win.ctx.strokeRect(this.x, this.y, this.w, this.h);
		win.ctx.globalAlpha = 0.1;
		win.ctx.fillRect(this.x, this.y, this.w, this.h);
		win.ctx.globalAlpha = 1;
	}
	var txt = rendertext(this.text, [230, 230, 230]);
	win.ctx.drawImage(txt, this.x, this.y);
};

GUITextbox.prototype.getbounds = function(win){
	return [this.x, this.y, this.w, this.h];
};

function GUIButton(x, y, w, h, img, func, bordervisible, data, txt){
	this.x = x || 0;
	this.y = y || 0;
	this.w = w || (img ? img.width : 10);
	this.h = h || (img ? img.height : 10);
	this.invis = !!bordervisible;
	this.img = img || null;
	this.txt = txt || null;
	this.texseed = ~~(Math.random() * 1000);
	this.func = func;
	this.data = data || {};
}

GUIButton.prototype.click = function(x, y){
	if(typeof this.func == "function"){
		this.func(this, x, y);
	}
};

GUIButton.prototype.render = function(win){
	if(this.invis){
		win.ctx.fillStyle = this.data.color || "#aba389";
		win.ctx.fillRect(this.x, this.y, this.w, this.h);
	}
	if(this.data.texpos && this.img){
		win.ctx.drawImage(uitex, this.data.texpos[0], this.data.texpos[1], this.data.texpos[2], this.data.texpos[3], this.x + (this.w >> 1) - (this.data.texpos[2] >> 1), this.y + (this.h >> 1) - (this.data.texpos[3] >> 1), this.data.texpos[2], this.data.texpos[3]);
	} else if(this.img){
		win.ctx.drawImage(this.img, this.x + (this.w >> 1) - (this.img.width >> 1), this.y + (this.h >> 1) - (this.img.height >> 1));
	}
	if(this.txt){
		var txt = rendertext(this.txt, (this.invis ? undefined : [200, 200, 200]));
		win.ctx.drawImage(txt, this.x + (this.w >> 1) - (txt.width >> 1), this.y + (this.h >> 1) - (txt.height >> 1) + 4);
	}
	if(this.invis){
		var b = 0;
		var l = 0;
		for(var i = this.w; (i-=5)>0; b = ~~(random(i+this.texseed)+.3)){
			win.ctx.drawImage(uitex, 5, 10 + 15 * (i>5&&b&&!l?1:(i<this.w-5&&.95<random(2*i+this.texseed)?2:0)), 5, 5, this.x + i, this.y + this.h - 4, 5, 5);
			if(i>5&&!b&&l&&.9<random(2*i+this.texseed))
				win.ctx.drawImage(uitex, 5, 15, 5, 5, this.x + i, this.y, 5, 5);
			l = b;
		}
		for(var i = this.h; (i-=5)>0; b = ~~(random(i+this.texseed)+.3)){
			win.ctx.drawImage(uitex, 10, 5 + 15 * (i>5&&b&&!l?1:(i<this.w-5&&.8<random(2*i+this.texseed)?2:0)), 5, 5, this.x + this.w - 4, this.y + i, 5, 5);
			if(i>5&&!b&&l)
				win.ctx.drawImage(uitex, 0, 20 + 15 * (.9<random(2*i+this.texseed)?1:0), 5, 5, this.x, this.y + i, 5, 5);
			l = b;
		}
		win.ctx.drawImage(uitex, 0, 0, 5, 5, this.x, this.y, 5, 5);
		win.ctx.drawImage(uitex, 10, 0, 5, 5, this.x + this.w - 4, this.y, 5, 5);
		win.ctx.drawImage(uitex, 0, 10, 5, 5, this.x, this.y + this.h - 4, 5, 5);
		win.ctx.drawImage(uitex, 10, 10, 5, 5, this.x + this.w - 4, this.y + this.h - 4, 5, 5);
	}
};

GUIButton.prototype.getbounds = function(){
	return [this.x, this.y, this.w, this.h];
};

function GUIToggle(x, y, w, h, name, func, data){
	this.x = x || 0;
	this.y = y || 0;
	this.h = h || 12;
	this.w = w || name.length * 8 + this.h + 2;
	this.name = name || "";
	this.func = func;
	this.data = data || {};
}

GUIToggle.prototype.click = function(){
	if(typeof this.func == "function"){
		this.func(this.data);
	}
};

GUIToggle.prototype.render = function(win){
	win.ctx.strokeStyle = "#000000";
	win.ctx.fillStyle = this.data.state ? "#88FF88" : "#FF8888";
	win.ctx.strokeRect(this.x, this.y, this.h, this.h);
	win.ctx.fillRect(this.x, this.y, this.h, this.h);
	win.ctx.drawImage(rendertext(this.name, [230, 230, 230]), this.x + this.h + 2, this.y + 2);
	//win.ctx.fillText(this.name, this.x + this.h * 1.5, this.y + 9, this.w - this.h * 1.5);
};

GUIToggle.prototype.getbounds = function(win){
	return [this.x, this.y, this.w, this.h];
};

function GUIWindow(x, y, w, h, title, closeable, resizeable, minw, minh){
	this.cache = document.createElement("canvas");
	this.ctx = this.cache.getContext("2d");
	this.x = x || 0;
	this.y = y || 0;
	this.w = w || Math.max(this.ctx.measureText(title||"").width + 5, 40);
	this.h = h || 20;
	this.cache.width = this.w;
	this.cache.height = this.h;
	this.ctx.imageSmoothingEnabled = false;
	this.minh = minh || this.h;
	this.minw = minw || this.w;
	this.ty = 30;
	this.title = title || "";
	this.closeable = !!closeable;
	this.resizeable = !!resizeable;
	this.texseed = ~~(Math.random() * 1000);
	this.elements = [];
	this.rerender = true;
	if(closeable){
		var self = this;
		this.elements.push(new GUIButton(8, 11, 9, 9, uitex, function(){
			var i = windows.indexOf(self);
			if(i != -1)
				windows.splice(i, 1);
		}, false, {texpos: [24, 0, 9, 9]}));
	}
}

GUIWindow.prototype.resize = function(w, h){
	w = Math.max(w, this.minw);
	h = Math.max(h, this.minh);
	this.rerender = true;
	this.w = this.cache.width = w;
	this.h = this.cache.height = h;
	this.ctx.imageSmoothingEnabled = false;
};

GUIWindow.prototype.click = function(x, y){
	for(var i = this.elements.length; i--;){
		var bounds = this.elements[i].getbounds(this);
		if(x > bounds[0] && x < bounds[0] + bounds[2]
		&& y > bounds[1] && y < bounds[1] + bounds[3]){
			this.elements[i].click(x - bounds[0], y - bounds[1]);
			return;
		}
	}
	if(y < 25){
		currentaction = ['m', this];
	} else if(this.resizeable && y > this.h - 10 && x > this.w - 10){
		currentaction = ['r', this];
	}
};

GUIWindow.prototype.render = function(ctx) {
	if(this.rerender){
		this.ctx.fillStyle = "#aba389";
		this.ctx.fillRect(1, 1, this.w - 2, this.h - 2);
		//this.ctx.fillRect(0, 0, this.w, this.h);
		this.ctx.fillStyle = "#7e635c";
		this.ctx.strokeStyle = "#000000";
		this.ctx.globalAlpha = 1;
		this.ctx.fillRect(7, 25, this.w - 14, this.h - 32);
		var b = 0;
		var l = 0;
		for(var i = this.w-9; (i-=3)>7; b = ~~(random(i+this.texseed)+.7)){
			this.ctx.drawImage(uitex, 18, 9 * (i>3&&b&&!l?1:(i>3&&.95<random(2*i+this.texseed)?2:0)), 3, 3, i, 25, 3, 3);
			if(i>3&&!b&&l)
				this.ctx.drawImage(uitex, 18, 15, 3, 3, i, this.h - 10, 3, 3);
			l = b;
		}
		for(var i = this.h-7; (i-=3)>25; b = ~~(random(i+this.texseed)+.7)){
			this.ctx.drawImage(uitex, 15, 3 + 9 * (i>3&&b&&!l?1:(i>3&&.95<random(2*i+this.texseed)?2:0)), 3, 3, 7, i, 3, 3);
			if(i>3&&!b&&l)
				this.ctx.drawImage(uitex, 21, 3 + 9 * (.95<random(2*i+this.texseed)?2:1), 3, 3, this.w - 10, i, 3, 3);
			l = b;
		}
		this.ctx.drawImage(uitex, 15, 0, 3, 3, 7, 25, 3, 3);
		this.ctx.drawImage(uitex, 15, 6, 3, 3, 7, this.h - 10, 3, 3);
		this.ctx.drawImage(uitex, 21, 0, 3, 3, this.w - 10, 25, 3, 3);
		this.ctx.drawImage(uitex, 21, 6, 3, 3, this.w - 10, this.h - 10, 3, 3);
		if(this.resizeable){
			this.ctx.lineWidth = 3;
			this.ctx.globalAlpha = 0.4;
			this.ctx.beginPath();
			this.ctx.moveTo(this.w - 10, this.h - 2);
			this.ctx.lineTo(this.w - 2, this.h - 2);
			this.ctx.lineTo(this.w - 2, this.h - 10);
			this.ctx.stroke();
		}
		this.ctx.lineWidth = 1;
		this.ctx.globalAlpha = 1;
		for(var x = this.elements.length; x--;){
			this.elements[x].render(this);
		}
		for(var i = this.w-5; (i-=5)>0;){
			this.ctx.drawImage(uitex, 21, 45, 5, 5, i, 0, 5, 5);
			this.ctx.drawImage(uitex, 20, 67, 5, 5, i, this.h - 5, 5, 5);
		}
		for(var i = this.h-5; (i-=5)>0; b = ~~(random(i+this.texseed)+.8)){
			this.ctx.drawImage(uitex, (i>11&&b&&!l?5:(i>11&&.9<random(2*i+this.texseed)?10:0)), 56, 5, 5, 0, i, 5, 5);
			this.ctx.drawImage(uitex, 41-(i>11&&!b&&l?5:(i>11&&.9<random(2*i+this.texseed)?10:0)), 56, 5, 5, this.w - 5, i, 5, 5);
			l = b;
		}
		this.ctx.drawImage(uitex, 0, 45, 20, 11, 0, 0, 20, 11);
		this.ctx.drawImage(uitex, 26, 45, 20, 11, this.w - 20, 0, 20, 11);
		this.ctx.drawImage(uitex, 0, 61, 20, 11, 0, this.h - 11, 20, 11);
		this.ctx.drawImage(uitex, 26, 61, 20, 11, this.w - 20, this.h - 11, 20, 11);
		this.ctx.fillStyle = "#000000";
		var txt = rendertext(this.title);
		this.ctx.drawImage(txt, (this.w >> 1) - (txt.width >> 1), 11);
		//this.ctx.fillText(this.title, (this.closeable ? 15 : 5), 11, this.w - (this.closeable ? 20 : 10));
		this.rerender = false;
	}
	ctx.drawImage(this.cache, this.x, this.y);
};

GUIWindow.prototype.addElement = function(e){
	e.y = this.ty;
	e.x = e.x <= 12 ? 12 : e.x;
	this.w = Math.max(e.x + e.w + 12, this.w);
	this.ty += e.h + 8;
	this.elements.push(e);
	this.resize(this.w, this.minh = this.minHeight());
};

GUIWindow.prototype.minHeight = function(){
	var height = 40;
	for(var x = this.elements.length; x--;){
		height = Math.max(this.elements[x].y + this.elements[x].h + 12, height);
	}
	return height;
};

GUIWindow.prototype.onevent = function(e, data){
	if(data.mousex < 0 || data.mousey < 0)
		return;
	switch(e){
		case 'm':
			this.x += data.mousex - data.lastx;
			this.y += data.mousey - data.lasty;
			break;
			
		case 'r':
			if(data.lastx >= this.x + this.minw)
				this.resize(this.w + data.mousex - data.lastx, this.h);
			if(data.lasty >= this.y + this.minh)
				this.resize(this.w, this.h + data.mousey - data.lasty);
			break;
			
		case 'e':
			if(data.mousex >= this.x && data.mousex < this.x + this.w
			   && data.mousey >= this.y && data.mousey < this.y + this.h){
				var bnd = data.extra.getbounds();
				data.extra.onmmove(data.mousex - this.x - bnd[0], data.mousey - this.y - bnd[1]);
			}
			break;
	}
};

function GUIArrow(x, y){
	this.x = x;
	this.y = y;
	this.w = 8;
	this.h = 8;
}

GUIArrow.prototype.getbounds = function(){
	return [0, 0, -1, -1];
};

GUIArrow.prototype.render = function(win){
	win.ctx.strokeStyle = "#000000";
	win.ctx.lineWidth = 2;
	win.ctx.beginPath();
	win.ctx.moveTo(this.x, this.y);
	win.ctx.lineTo(this.x - this.w, this.y - this.h/2);
	win.ctx.lineTo(this.x - this.w, this.y + this.h/2);
	win.ctx.lineTo(this.x, this.y);
	win.ctx.stroke();
	win.ctx.fillStyle = "#FFFFFF";
	win.ctx.beginPath();
	win.ctx.moveTo(this.x, this.y);
	win.ctx.lineTo(this.x - this.w, this.y - this.h/2);
	win.ctx.lineTo(this.x - this.w, this.y + this.h/2);
	win.ctx.fill();
	win.ctx.lineWidth = 1;
};

function GUICircle(x, y){
	this.x = x;
	this.y = y;
	this.w = 8;
	this.h = 8;
}

GUICircle.prototype.getbounds = function(){
	return [0, 0, -1, -1];
};

GUICircle.prototype.render = function(win){
	win.ctx.strokeStyle = "#000000";
	win.ctx.lineWidth = 3;
	win.ctx.beginPath();
	win.ctx.arc(this.x - this.w/2, this.y - this.h/2, 5, 0, 2*Math.PI);
	win.ctx.stroke();
	win.ctx.strokeStyle = "#FFFFFF";
	win.ctx.lineWidth = 2;
	win.ctx.beginPath();
	win.ctx.arc(this.x - this.w/2, this.y - this.h/2, 5, 0, 2*Math.PI);
	win.ctx.stroke();
	win.ctx.lineWidth = 1;
};

function GUISlider(x, y, w, maxval, win, onvalchange){
	this.x = x;
	this.y = y;
	this.w = w || 50;
	this.h = 4;
	this.step = 1;
	this.cir = new GUICircle(this.x + this.w * this.step, this.y + 4);
	this.maxval = maxval || 10;
	this.value = this.maxval * this.step;
	this.win = win;
	this.func = onvalchange;
}

GUISlider.prototype.getbounds = function(){
	return [this.x - 2, this.y - 6, this.w + 2, this.h + 4];
};

GUISlider.prototype.render = function(win){
	win.ctx.strokeStyle = "#000000";
	win.ctx.lineWidth = 3;
	win.ctx.globalAlpha = .8;
	win.ctx.beginPath();
	win.ctx.moveTo(this.x, this.y);
	win.ctx.lineTo(this.x + this.w, this.y);
	win.ctx.stroke();
	win.ctx.globalAlpha = 1;
	this.cir.render(win);
};

GUISlider.prototype.click = function(x, y){
	if(x / this.w < 0)
		x = 0;
	if(x / this.w > 1)
		x = this.w;
	currentaction = ["e", this.win, this];
	this.value = ~~((this.step = ~~(x / this.w * 75 + .5) / 75) * this.maxval + .5);
	this.cir.x = this.x + x + this.cir.w / 2;
	this.win.rerender = true;
	if(typeof this.func === "function")
		this.func(this.value);
};

GUISlider.prototype.setval = function(val){
	this.value = val;
	this.step = (this.value / this.maxval);
	this.cir.x = this.x + this.step * this.w + this.cir.w / 2;
};

GUISlider.prototype.onmmove = function(x, y){
	this.click(x, y);
};

/* horrible code ahead */
function UtilColorPicker(x, y, wheelimg, callback, sel){
	var crgb = (sel[0] + sel[1] + sel[2] >= 255 ? [sel[0], sel[1], sel[2]] : [255, 255, 255]);
	var srgb = [sel[0], sel[1], sel[2]];
	var onupd;
	//var crgb = [255, 255, 255];
	//var srgb = [255, 255, 255];
	var cvs = document.createElement("canvas");
	var cvs2 = document.createElement("canvas");
	cvs.width = wheelimg.width;
	cvs.height = wheelimg.height;
	cvs2.width = 30;
	cvs2.height = cvs.height;
	var ctx = cvs.getContext("2d");
	var ctx2 = cvs2.getContext("2d");
	var grd = ctx2.createLinearGradient(0, 0, 0, cvs2.height);
	grd.addColorStop(0, "rgb(" + crgb.join(',') + ")");
	grd.addColorStop(1, "#000000");
	ctx2.fillStyle = grd;
	ctx2.fillRect(0, 0, cvs2.width, cvs2.height);
	ctx.drawImage(wheelimg, 0, 0);
	var win = new GUIWindow(x, y, 133, 350, "Pick a color", true, false);
	var cir = new GUICircle(79, 99); /* TODO... */
	var arr = new GUIArrow(0, 0);
	win.elements.push(cir);
	var btn = new GUIButton(10, 0, 128, 128, cvs, function(btn, x, y){
		currentaction = ['e', win, btn];
		if(x < 0 || x >= 128 || y < 0 || y >= 128)
			return;
		var ctx = btn.img.getContext("2d");
		var pixData = ctx.getImageData(0, 0, btn.img.width, btn.img.height);
		var ptr = (y * btn.img.height + x) * 4;
		if(pixData.data[ptr+3] != 255)
			return;
		var rgb = [pixData.data[ptr], pixData.data[ptr + 1], pixData.data[ptr + 2]];
		btn.data.selected[0] = rgb[0];
		btn.data.selected[1] = rgb[1];
		btn.data.selected[2] = rgb[2];
		btn.data.circle.x = x + 15;
		btn.data.circle.y = y + 35;
		btn.data.win.rerender = true;
		btn.data.updfunc();
	}, false, {selected: crgb, circle: cir, win: win, grd: grd, updfunc: function(){}});
	btn.onmmove = function(x, y){
		this.func(this, x, y);
	};
	win.addElement(btn);
	win.resize(win.w + 35, win.h);
	var btn3 = new GUIButton(10, 0, 32, 32, null, null, true, {color: "rgb("+srgb.join(',')+")", bgalpha: 1});
	var btn2 = new GUIButton(10 + btn.w + 10, 30, cvs2.width, cvs2.height, cvs2, function(btn, x, y, ac){
		if(x < 0) x = 0;
		if(y < 0) y = 0;
		if(y > 128) y = 128;
		if(x >= 30) x = 30;
		if(!ac)
			currentaction = ['e', win, btn];
		btn.data.colors[1][0] = ~~(btn.data.colors[0][0] * (-(y - btn.img.height) / btn.img.height));
		btn.data.colors[1][1] = ~~(btn.data.colors[0][1] * (-(y - btn.img.height) / btn.img.height));
		btn.data.colors[1][2] = ~~(btn.data.colors[0][2] * (-(y - btn.img.height) / btn.img.height));
		btn.data.arr.y = y + 30;
		onupd();
	}, true, {colors: [crgb, srgb], arr: arr});
	arr.x = btn2.x + 4;
	arr.y = btn2.y;
	btn.data.updfunc = function(){
		btn2.func(btn2, 0, arr.y - 30, true);
	};
	btn2.onmmove = function(x, y){
		this.func(this, x, y);
	};
	win.elements.push(arr);
	win.elements.push(btn2);
	win.addElement(btn3);
	var txtr = new GUIButton(btn3.x + btn3.w + 2.5, btn3.y + 2, 34, 4, null, null, false, null, "R: " + srgb[0]);
	var txtg = new GUIButton(txtr.x, txtr.y + 12, 34, 4, null, null, false, null, "G: " + srgb[1]);
	var txtb = new GUIButton(txtg.x, txtg.y + 12, 34, 4, null, null, false, null, "B: " + srgb[2]);
	var slir = new GUISlider(txtr.x + 38, txtr.y + 2.5, 91, 255, win, function(v){
		srgb[0] = v;
		onupd();
	});
	var slig = new GUISlider(txtg.x + 38, txtg.y + 2.5, 91, 255, win, function(v){
		srgb[1] = v;
		onupd();
	});
	var slib = new GUISlider(txtb.x + 38, txtb.y + 2.5, 91, 255, win, function(v){
		srgb[2] = v;
		onupd();
	});
	win.elements.push(txtr);
	win.elements.push(txtg);
	win.elements.push(txtb);
	win.elements.push(slir);
	win.elements.push(slig);
	win.elements.push(slib);
	onupd = function(){
		txtr.txt = "R:" + srgb[0];
		txtg.txt = "G:" + srgb[1];
		txtb.txt = "B:" + srgb[2];
		slir.setval(srgb[0]);
		slig.setval(srgb[1]);
		slib.setval(srgb[2]);
		grd.addColorStop(0, "rgb(" + crgb.join(',') + ")");
		ctx2.fillStyle = grd;
		ctx2.fillRect(0, 0, cvs2.width, cvs2.height);
		btn3.data.color = "rgb(" + srgb.join(',') + ")";
		win.rerender = true;
	}
	onupd();
	win.addElement(new GUIButton(10, 0, win.w - 20, 20, null, function(btn, x, y){
		btn.data.cb(btn.data.sel);
		btn.data.win.elements[0].click(0, 0);
	}, true, {cb: callback, sel: srgb, win: win}, "Add color"));
	return win;
}
