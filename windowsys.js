var WorldOfPixels = WorldOfPixels || {};
WorldOfPixels.windowsys = { /* Will be replaced by a WindowManager object */
	defaultScale: 1,
	theme: {
		gui: "img/gui.png", /* GUI img, will become an Image object on load */
		alpha: "img/alphaascii.png", /* Alphabet img */
		cfg: {
			mainclr: "#7E635C",
			accentclr: "#ABA389",
			window: {
				titleSize: 20,
				/* If the texture drawn is larger than borderPad, it could hide part of the window. */
				borderPad: 6,
				default: {
					/* multiple texpos arrays for variations */
					upleft: [[0, 54, 12, 10]], /* Upper left corner */
					upctr: [[21, 54, 5, 4], [13, 54, 7, 7]], /* Upper side */
					upright: [[27, 54, 12, 10]], /* Upper right corner */
					ctrleft: [[0, 65, 4, 5], [6, 65, 4, 5], [12, 65, 4, 5]], /* Left side */
					ctrright: [[35, 65, 4, 5], [29, 65, 4, 5], [23, 65, 4, 5]], /* Right side*/
					lowleft: [[0, 71, 12, 10]], /* Lower left corner */
					lowctr: [[21, 77, 5, 4], [13, 74, 7, 7]], /* Lower side */
					lowright: [[27, 71, 12, 10]] /* Lower left corner */
				}
			},
			innerframe: {
				default: {
					upleft: [[36, 0, 3, 3]],
					upctr: [[39, 0, 3, 3]],
					upright: [[42, 0, 3, 3]],
					ctrleft: [[36, 3, 3, 3]],
					ctrright: [[42, 3, 3, 3]],
					lowleft: [[36, 6, 3, 3]],
					lowctr: [[39, 6, 3, 3]],
					lowright: [[42, 6, 3, 3]],
					
					variations: [[0, 9], [0, 18]]
				}
			},
			button: {
				fixedSize: false,
				colorizable: true, /* If the texture has transparent spots */
				default: {
					upleft: [[0, 0, 6, 6]],
					upctr: [[6, 0, 6, 6]],
					upright: [[12, 0, 6, 6]],
					ctrleft: [[0, 6, 6, 6]],
					ctrright: [[12, 6, 6, 6]],
					lowleft: [[0, 12, 6, 6]],
					lowctr: [[6, 12, 6, 6]],
					lowright: [[12, 12, 6, 6]],
				
					/* Offsets for variations, makes a new texture position adding these offsets */
					variations: [[0, 18], [0, 36]]
				},
				pushed: {
					/* Movement applied to items (images/text) when the button is pushed */
					itemOffset: [1, 1],
					/* copies a state's properties, except the ones 
					 * already present in this state
					 **/
					copy: "default",
					offset: [18, 0] /* offset applied to all texture positions */
					/* the offset is applied before the variations. */
				}
			},
			closebtn: {
				fixedSize: true,
				default: {
					pos: [[45, 0, 9, 9]]
				},
				pushed: {
					pos: [[45, 9, 9, 9]]
				}
			},
			uparrow: {
				fixedSize: true,
				default: {
					pos: [[82, 0, 16, 16]]
				},
				pushed: {
					pos: [[98, 0, 16, 16]]
				}
			},
			downarrow: {
				fixedSize: true,
				default: {
					pos: [[114, 0, 16, 16]]
				},
				pushed: {
					pos: [[130, 0, 16, 16]]
				}
			}
		}
	}
};

function parseTheme(cfg) {
	function cloneObj(obj) {
		return JSON.parse(JSON.stringify(obj));
	}

	function parseState(st, parent) {
		var positions = ["upleft",  "upctr",  "upright",
		                 "ctrleft",           "ctrright",
		                 "lowleft", "lowctr", "lowright"];
		if(st.copy && parent[st.copy]) {
			var copy = cloneObj(parent[st.copy]);
			for(var prop in st) {
				delete copy[prop];
			}
			for(var prop in copy) {
				st[prop] = copy[prop];
			}
			delete st.copy;
		}
		if(st.offset) {
			if(parent.fixedSize && st.pos) {
				st.pos[0] += st.offset[0];
				st.pos[1] += st.offset[1];
			} else if(!st.fixedSize) {
				for(var prop in st) {
					if(positions.indexOf(prop) != -1) {
						prop = st[prop];
						for(var i = 0; i < prop.length; i++) {
							prop[i][0] += st.offset[0];
							prop[i][1] += st.offset[1];
						}
					}
				}
			}
			delete st.offset;
		}
		return st.variations ? (function() {
			while(st.variations.length) {
				var vari = st.variations.pop();
				for(var prop in st) {
					if(positions.indexOf(prop) != -1) {
						prop = st[prop];
						var newpos = [prop[0][0] + vari[0],
						              prop[0][1] + vari[1],
						              prop[0][2], prop[0][3]];
						prop.push(newpos);
					}
				}
			}
			delete st.variations;
		}) : null;
	}

	var fun = parseState(cfg.window, cfg);
	if(fun) fun();
	var exceptions = ["mainclr", "accentclr", "window"];
	var later = [];
	for(var prop in cfg) {
		if(exceptions.indexOf(prop) == -1) {
			for(var state in cfg[prop]) {
				if(typeof cfg[prop][state] === "object") {
					fun = parseState(cfg[prop][state], cfg[prop]);
					if(fun) later.push(fun);
				}
			}
		}
	}

	for(var i = 0; i < later.length; i++) {
		later[i]();
	}
}

function GUIButton(wdow, x, y, w, h, options) {
	this.window = wdow;
	this.state = "default";
	this.texture = this.window.wm.getTexture("button");
	this.x = x;
	this.y = y;
	this.w = w;
	this.h = h;
	this.options = options || {};
}

GUIButton.prototype.render = function(ctx) {
	var btndraw = this.window.wm.getDrawables(this.texture);
	var color = this.options.color || this.window.wm.theme.cfg.accentclr;
	var seed = this.window.creationtime;
	var offs = this.texture[this.state].itemOffset || [0, 0];
	if(this.texture.colorizable) {
		ctx.fillStyle = color;
		ctx.fillRect(this.x, this.y, this.w, this.h);
	}

	if(this.options.txt) {
		var txt = this.window.wm.renderText(this.options.txt);
		var xctr = this.w / 2 - txt.width / 2 | 0;
		ctx.drawImage(txt, xctr + offs[0], this.y + this.h / 3 + offs[1] | 0);
	}

	for(var i = this.y; i < this.y + this.h;) {
		var pos = btndraw[this.state].ctrleft(ctx, this.x, i, false, false, seed * i);
		i += pos[3];
	}

	/* getwidth, instead of 6... */
	for(var i = this.y; i + 6 < this.y + this.h;) {
		var pos = btndraw[this.state].ctrright(ctx, this.x + this.w, i, true, false, seed * i);
		i += pos[3];
	}

	for(var i = this.x; i < this.x + this.w;) {
		var pos = btndraw[this.state].upctr(ctx, i, this.y, false, false, seed * i);
		i += pos[2];
	}

	for(var i = this.x; i + 6 < this.x + this.w;) {
		var pos = btndraw[this.state].lowctr(ctx, i, this.y + this.h, false, true, seed + i);
		i += pos[2];
	}

	btndraw[this.state].upleft(ctx, this.x, this.y);
	btndraw[this.state].upright(ctx, this.x + this.w, this.y, true);
	btndraw[this.state].lowleft(ctx, this.x, this.y + this.h, false, true);
	btndraw[this.state].lowright(ctx, this.x + this.w, this.y + this.h, true, true);
};

GUIButton.prototype.onclick = function(x, y) {
	console.log("click");
};

/* wm = WindowManager object */
function GUIWindow(wm, x, y, w, h, title, options) {
	this.wm = wm;
	this.x = x;
	this.y = y;
	this.w = w;
	this.h = h;
	this.title = title || "";
	this.options = options;

	this.currentaction = null; /* For resizing or moving the window. */

	this.frame = document.createElement("canvas");
	this.canvas = document.createElement("canvas");
	this.ctx = this.canvas.getContext("2d");
	this.frameoffset = wm.getWindowFrameSize();
	this.frame.width = this.frameoffset.w + this.w;
	this.frame.height = this.frameoffset.h + this.h;
	this.canvas.width = this.w;
	this.canvas.height = this.h;
	this.ctx.imageSmoothingEnabled = false;

	this.move(x, y);

	var mdown = function(e) {
		var scale = this.wm.scale;
		this.clickDown(e.offsetX, e.offsetY);
	}.bind(this);

	var mmove = function(e) {
		var scale = this.wm.scale;
		var x = e.pageX - this.x * scale;
		var y = e.pageY - this.y * scale;
		if(this.currentaction) {
			this.currentaction(e.pageX / scale, e.pageY / scale);
		} else {
			this.mouseMove(x / scale, y / scale);
		}
	}.bind(this);

	var mup = function(e) {
		var scale = this.wm.scale;
		var x = e.pageX - this.x * scale;
		var y = e.pageY - this.y * scale;
		this.clickUp(x / scale, y / scale);
	}.bind(this);

	var mleave = function() {
		this.clickUp(-1, -1);
	}.bind(this);

	this.evtfuncs = {
		mdown: mdown,
		mmove: mmove,
		mup: mup,
		mleave: mleave
	};

	this.frame.addEventListener("mousedown", mdown);
	window.addEventListener("mousemove", mmove);
	window.addEventListener("mouseup", mup);
	document.body.addEventListener("mouseleave", mleave);

	this.creationtime = Date.now();
	this.elements = [];
	this.titlebuttons = [];
	if(options.closeable) {
		this.titlebuttons.push({
			state: "default",
			texture: wm.getTexture("closebtn"),
			onclick: function() {
				this.wm.delWindow(this);
			}.bind(this)
		});
	}
}

GUIWindow.prototype.move = function(x, y) {
	this.frame.style.transform = "translate(" + x + "px," + y + "px)";
	this.x = x;
	this.y = y;
};

GUIWindow.prototype.render = function() {
	var shouldrender = false; /* for animations */
	for(var i = this.elements.length; i--;) {
		shouldrender |= this.elements[i].render(this.ctx);
	}

	if(shouldrender) {
		this.requestRender();
	}
};

GUIWindow.prototype.requestRender = function() {
	this.wm.requestRender(this);
};

GUIWindow.prototype.resize = function(w, h){
	w = Math.max(w, this.minw);
	h = Math.max(h, this.minh);
	this.w = this.canvas.width = w;
	this.h = this.canvas.height = h;
	this.ctx.imageSmoothingEnabled = false;
	this.requestRender();
};

GUIWindow.prototype.getButton = function(x, y) {
	for(var i = 0; i < this.titlebuttons.length; i++) {
		var btn = this.titlebuttons[i];
		var btnx = this.frameoffset.x + 1;
		var btny = this.frameoffset.y / 2.5 | 0;
		var btnw = btn.texture.default.pos[0][2];
		var btnh = btn.texture.default.pos[0][3];
		if(x >= btnx && x < btnx + btnw && y >= btny && y < btny + btnh) {
			return btn;
		}
	}

	/* Canvas content */
	x -= this.frameoffset.x;
	y -= this.frameoffset.y;

	for(var i = this.elements.length; i--;){
		var elmnt = this.elements[i];
		if(x >= elmnt.x && x < elmnt.x + elmnt.w
		&& y >= elmnt.y && y < elmnt.y + elmnt.h){
			return elmnt;
		}
	}
	return null;
};

GUIWindow.prototype.clickDown = function(x, y) {
	console.log(x, y);
	this.options.clickdown = true;
	var btn = this.getButton(x, y);
	if(btn) {
		this.options.pushing = btn;
		if(btn.texture.pushed) {
			btn.state = "pushed";
			this.requestRender();
		}
	} else if(y < this.wm.theme.cfg.window.titleSize + this.wm.theme.cfg.window.borderPad) {
		this.currentaction = function(x, y) {
			this.win.move(x - this.offsx, y - this.offsy);
		}.bind({offsx: x, offsy: y, win: this});
	}
};

GUIWindow.prototype.mouseMove = function(x, y) {
	var btn = this.getButton(x, y);
	var pushbtn = this.options.pushing;
	if(this.options.clickdown && pushbtn) {
		if(btn != pushbtn && pushbtn.state != "default") {
			pushbtn.state = "default";
			this.requestRender();
		} else if(btn == pushbtn && pushbtn.state != "pushed") {
			pushbtn.state = "pushed";
			this.requestRender();
		}
	}
};

GUIWindow.prototype.clickUp = function(x, y){
	this.options.clickdown = false;
	var btn = this.getButton(x, y);
	var pushbtn = this.options.pushing;
	this.currentaction = null;
	if(btn && btn == pushbtn) {
		if(btn.state == "pushed") {
			btn.state = "default";
			this.requestRender();
		}
		btn.onclick(x - btn.x, y - btn.y);
		return true;
	}
	this.options.pushing = null;
	return false;
};

GUIWindow.prototype.delete = function() {
	this.frame.removeEventListener("mousedown", this.evtfuncs.mdown);
	window.removeEventListener("mousemove", this.evtfuncs.mmove);
	window.removeEventListener("mouseup", this.evtfuncs.mup);
	document.body.removeEventListener("mouseleave", this.evtfuncs.mleave);
	this.canvas.width = this.frame.width = 0;
};


function WindowManager(div, theme, scale) {
	this.windows = {};
	this.windiv  = div;
	this.theme   = theme;
	this.setScale(scale);
}

WindowManager.prototype.setScale = function(scale) {
	var delta = 1 + scale - this.scale;
	this.scale = scale;
	this.windiv.style.transform = "scale(" + scale + ")";
	for(var i in this.windows) {
		i = this.windows[i];
		i.move(i.x / delta, i.y / delta);
	}
};

WindowManager.prototype.getWindowFrameSize = function() {
	var win = this.getTexture("window");
	var size = {
		x: win.borderPad,
		y: win.titleSize + win.borderPad
	};
	size.w = size.x + win.borderPad;
	size.h = size.y + win.borderPad;
	return size;
};

WindowManager.prototype.getTexture = function(name) {
	return this.theme.cfg[name];
};

WindowManager.prototype.getTexturePos = function(posarr, seed) {
	function seededrandom() {
	    var x = Math.sin(seed++) * 10000;
	    return x - Math.floor(x);
	}
	if(posarr) {
		var len = posarr.length;
		var rnd = seededrandom();
		return (len == 1) ? posarr[0] : posarr[rnd * (len) | 0];
	}
	return [0, 0, 0, 0];
};

WindowManager.prototype.getDrawables = function(texture) {
	var drawfunctions = {};
	for(var prop in texture) {
		var setting = texture[prop];
		if(typeof setting === "object") {
			var dprop = drawfunctions[prop] = {};
			for(var pos in setting) {
				/* subtractsize subtracts the width and height of the texture to x and y */
				dprop[pos] = (function(ctx, x, y, subtractwidth, subtractheight, seed) {
					var pos = this.getTex(this.arr, seed);
					if(subtractwidth) { x -= pos[2]; }
					if(subtractheight) { y -= pos[3]; }
					ctx.drawImage(this.gui, pos[0], pos[1], pos[2], pos[3],
					              x, y, pos[2], pos[3]);
					return pos;
				}).bind({
					getTex: this.getTexturePos,
					arr: setting[pos],
					gui: this.theme.gui
				});
			}
		} else {
			drawfunctions[prop] = setting;
		}
	}
	return drawfunctions;
};

WindowManager.prototype.render = function() {
	this.pendingrender = false;
	for(var window in this.windows) {
		this.renderWindow(this.windows[window]);
	}
};

WindowManager.prototype.renderWindow = function(window) {
	var frameoffx = window.frameoffset.x;
	var frameoffy = window.frameoffset.y;
	var canvas    = window.frame;
	var content   = window.canvas;
	var ctx       = canvas.getContext("2d");

	var wintex    = this.getTexture("window");
	var windraw   = this.getDrawables(wintex);
	var frametex  = this.getTexture("innerframe");
	var framedraw = this.getDrawables(frametex);

	var pad       = wintex.borderPad;
	var btnoffset = pad;

	var seed      = window.creationtime;

	window.render();

	ctx.fillStyle = this.theme.cfg.accentclr;
	ctx.fillRect(1, 1, canvas.width - 2, canvas.height - 2);

	ctx.fillStyle = this.theme.cfg.mainclr;
	ctx.fillRect(frameoffx, frameoffy, content.width, content.height);

	ctx.drawImage(content, frameoffx, frameoffy);

	for(var i = 0; i < window.titlebuttons.length; i++) {
		var btn = window.titlebuttons[i];
		var x = pad + i * pad;
		var btndraw = this.getDrawables(btn.texture); /* TODO: getWidth */
		var pos = btndraw[btn.state].pos(ctx, x + 1, frameoffy / 2.5 | 0);
		btnoffset += pos[2];
	}

	if (window.title) {
		var txt = this.renderText(window.title);
		var xctr = btnoffset + (canvas.width - btnoffset) / 2 - txt.width / 2 - pad / 3 | 0;
		ctx.drawImage(txt, xctr, frameoffy / 2.5 | 0);
	}

	for(var i = frameoffy; i < canvas.height - pad;) {
		var pos = framedraw.default.ctrleft(ctx, pad, i, false, false, seed * i);
		i += pos[3];
	}

	for(var i = frameoffy; i < canvas.height - pad;) {
		var pos = framedraw.default.ctrright(ctx, canvas.width - pad, i, true, false, seed + i);
		i += pos[3];
	}

	for(var i = frameoffx; i + 3 < canvas.width - pad;) {
		var pos = framedraw.default.upctr(ctx, i, frameoffy, false, false, seed * i);
		i += pos[2];
	}

	for(var i = frameoffx; i < canvas.width - pad;) {
		var pos = framedraw.default.lowctr(ctx, i, canvas.height - pad, false, true, seed + i);
		i += pos[2];
	}

	framedraw.default.upleft(ctx, frameoffx, frameoffy);
	framedraw.default.upright(ctx, canvas.width - frameoffx, frameoffy, true);
	framedraw.default.lowleft(ctx, frameoffx, canvas.height - pad, false, true);
	framedraw.default.lowright(ctx, canvas.width - frameoffx, canvas.height - pad, true, true);

	for(var i = 0; i < canvas.height;) {
		var pos = windraw.default.ctrleft(ctx, 0, i, false, false);
		i += pos[3];
	}

	for(var i = 0; i < canvas.height;) {
		var pos = windraw.default.ctrright(ctx, canvas.width, i, true, false);
		i += pos[3];
	}

	for(var i = 0; i < canvas.width;) {
		var pos = windraw.default.upctr(ctx, i, 0, false, false);
		i += pos[2];
	}

	for(var i = 0; i < canvas.width;) {
		var pos = windraw.default.lowctr(ctx, i, canvas.height, false, true);
		i += pos[2];
	}

	windraw.default.upleft(ctx, 0, 0);
	windraw.default.upright(ctx, canvas.width, 0, true);
	windraw.default.lowleft(ctx, 0, canvas.height, false, true);
	windraw.default.lowright(ctx, canvas.width, canvas.height, true, true);
};

WindowManager.prototype.requestRender = function(wdow) {
	if(!this.pendingrender) {
		this.pendingrender = true;
		var self = this;
		window.requestAnimationFrame(function() {
			self.render();
		});
	}
};

/* Window X/Y is specified on window.x, window.y */
WindowManager.prototype.addWindow = function(window) {
	if(!this.windows[window.title]) {
		this.windiv.appendChild(window.frame);
		this.windows[window.title] = window;
	}
};

WindowManager.prototype.delWindow = function(window) {
	if(this.windows[window.title]) {
		this.windiv.removeChild(window.frame);
		delete this.windows[window.title];
		window.delete();
	}
};

WindowManager.prototype.renderText = function(str, rgb) {
	var img = this.theme.alpha;
	var lines = str.split('\n');
	var w = str.length * 8;
	var h = lines.length * 16;
	var txtcanvas = document.createElement("canvas");
	var txtctx = txtcanvas.getContext("2d");
	txtcanvas.width = w;
	txtcanvas.height = h;
	for(var i = 0; i < lines.length; ++i){
		for(var j = lines[i].length; j--;){
			var cc = lines[i].charCodeAt(j) - 33;
			if(cc >= 0 && cc < 94){
				txtctx.drawImage(img, cc * 8, 0, 8, 16, j * 8, i * 16, 8, 16);
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
	return txtcanvas;
};

WindowManager.prototype.centerWindow = function(win) {
	win.move(window.innerWidth / this.scale / 2 - win.w / 2 | 0, window.innerHeight / this.scale / 2 - win.h / 2 | 0);
};


WorldOfPixels.windowsys.init = function(oncomplete) {
	var DPI = (function findFirstPositive(b) {
		var a, i, c = function(d, e) {
			if(e >= d) {
				a = d + (e - d) / 2;
				if(b(a) > 0 && (a == d || 0 >= b(a - 1))) {
					return a;
				} else if(0 >= b(a)) {
					return c(a + 1, e);
				} else {
					return c(d, a - 1);
				}
			} else {
				return -1;
			}
		}
		for (i = 1; 0 >= b(i);) i *= 2;
		return c(i / 2, i) | 0;
	})(function(x) { return matchMedia("(max-resolution: " + x + "dpi)").matches });
	console.log("DPI is:", DPI);
	var scale = 1 / 96 * DPI | 0;
	this.windowsys.dpiScale = scale <= 0 ? 1 : scale;
	var loadTheme = (function(cb) {
		parseTheme(this.cfg);
		var guisrc   = this.gui;
		var alphasrc = this.alpha;
		this.gui     = new Image();
		this.alpha   = new Image();

		var toLoad   = 2;

		var theme    = this;
		this.gui.onload = this.alpha.onload = function() {
			if(--toLoad == 0) {
				cb(theme);
			}
		};
		this.alpha.src = alphasrc;
		this.gui.src   = guisrc;
	}).bind(this.windowsys.theme);

	delete this.windowsys.init;
	loadTheme(function(theme) {
		var div = document.getElementById("windows");
		this.windowsys = new WindowManager(div, theme, this.windowsys.dpiScale);
		oncomplete();
	}.bind(this));
}.bind(WorldOfPixels);
