"use strict";
import { elements } from './main.js';
import { EVENTS as e } from './conf.js';
import { PublicAPI, eventSys } from './global.js';

export const windowSys = {
	windows: {},
	class: {
		input: UtilInput,
		dropDown: OWOPDropDown,
		window: GUIWindow
	},
	addWindow: addWindow,
	delWindow: delWindow,
	centerWindow: centerWindow
};

PublicAPI.windowSys = windowSys;

export function UtilInput(title, message, inputType, cb) {
	this.win = new GUIWindow(0, 0, 200, 60, title, {
		centered: true,
		closeable: true
	}, function(win) {
		this.inputField = win.addObj(mkHTML("input", {
			style: "width: 100%; height: 50%;",
			type: inputType,
			placeholder: message,
			onkeyup: function(e) {
				if((e.which || e.keyCode) == 13) {
					this.okButton.click();
				}
			}.bind(this)
		}));
		this.okButton = win.addObj(mkHTML("button", {
			innerHTML: "OK",
			style: "width: 100%; height: 50%;",
			onclick: function() {
				cb(this.inputField.value);
				this.getWindow().close();
			}.bind(this)
		}));
	}.bind(this));
}

UtilInput.prototype.getWindow = function() {
	return this.win;
};

/* Highly specific purpose, should only be created once */
export function OWOPDropDown() {
	this.win = new GUIWindow(0, 0, 68, 122, null, {
		immobile: true
	},
	function(win) {
		win.frame.className = "owopdropdown";
		win.container.style = "border: none;\
			background-color: initial;\
			pointer-events: none;\
			margin: 0;";
		var hlpdiv = win.addObj(mkHTML("div", {
			className: "winframe",
			style: "padding: 0;\
				width: 68px; height: 64px;"
		}));
		var dntebtn = win.addObj(mkHTML("button", {
			className: "winframe",
			style: "padding: 0;\
			background-color: #ffd162;\
			left: -6px; top: 70px;\
			width: 38px; height: 36px;"
		}));
		var rddtbtn = win.addObj(mkHTML("button", {
			className: "winframe",
			style: "padding: 0;\
			right: -6px; top: 70px;\
			width: 38px; height: 36px;"
		}));
		var hlpcontainer = mkHTML("div", {
			className: "wincontainer",
		});
		hlpdiv.appendChild(hlpcontainer);
		hlpcontainer.appendChild(mkHTML("button", {
			style: "background-image: url(img/gui.png);\
				background-position: -64px 4px;\
				background-origin: border-box;\
				background-repeat: no-repeat;\
				width: 100%; height: 100%;",
			onclick: function() {console.log("help")}.bind(this)
		}));
	});
}

OWOPDropDown.prototype.getWindow = function() {
	return this.win;
};

/* wm = WindowManager object 
 * initfunc = function where all the windows objects should be added,
 *            first function argument is the guiwindow object itself
 */
export function GUIWindow(title, options, initfunc) {
	options = options || {};
	this.wm = WorldOfPixels.windowsys;
	this.opt = options;
	this.title = title;
	this.frame = document.createElement("div");
	this.container = document.createElement("div");
	
	if (title) {
		this.titlespan = document.createElement("span");
		this.titlespan.innerHTML = title;
	
		this.frame.appendChild(this.titlespan);
	}
	
	this.frame.appendChild(this.container);
	
	if (options.centered) {
		options.immobile = true;
		this.frame.className = "centered";
	}
		
	Object.defineProperty(this, "realw", {
		get: function() {
			return this.frame.offsetWidth;
		}.bind(this)
	});
	Object.defineProperty(this, "realh", {
		get: function() {
			return this.frame.offsetHeight;
		}.bind(this)
	});
	
	this.elements = [];
	
	this.creationtime = Date.now();
	this.currentaction = null; /* Func to call every mousemove evt */
	
	if (initfunc) {
		initfunc(this);
	}
	
	this.mdownfunc = function(e) {
		var offx = e.clientX - this.x;
		var offy = e.clientY - this.y;
		if (e.toElement === this.frame && !this.opt.immobile) {
			this.currentaction = function(x, y) {
				this.move(x - offx, y - offy);
			}
		}
	}.bind(this);
	
	/*if (options.centerOnce) {
		// does not work
		this.wm.centerWindow(this);
	}*/
	
	this.frame.addEventListener("mousedown", this.mdownfunc);
	
	this.mupfunc = function(e) {
		this.currentaction = null;
	}.bind(this);
	
	window.addEventListener("mouseup", this.mupfunc);
	
	this.mmovefunc = function(e) {
		if (this.currentaction) {
			this.currentaction(e.clientX, e.clientY);
		}
	}.bind(this);
	
	window.addEventListener("mousemove", this.mmovefunc);
	
	if(options.closeable) {
		this.frame.appendChild(mkHTML("button", {
			onclick: function() {
				this.close();
			}.bind(this)
		}));
	}
}

GUIWindow.prototype.getWindow = function() {
	return this;
};

GUIWindow.prototype.addObj = function(object) {
	this.elements.push(object);
	this.container.appendChild(object);
	return object;
};

GUIWindow.prototype.delObj = function(object) {
	var i = this.elements.indexOf(object);
	if (i != -1) {
		this.elements.splice(i, 1);
		this.container.removeChild(object);
	}
};

GUIWindow.prototype.move = function(x, y) {
	if (!this.opt.immobile) {
		this.frame.style.transform = "translate(" + x + "px," + y + "px)";
		this.x = x;
		this.y = y;
	}
	return this;
};

GUIWindow.prototype.resize = function(w, h){
	this.w = w;
	this.h = h;
	this.container.style.width = w + "px";
	this.container.style.height = h + "px";
	return this;
};

GUIWindow.prototype.close = function() {
	this.wm.delWindow(this);
	window.removeEventListener("mousemove", this.mmovefunc);
	window.removeEventListener("mouseup", this.mupfunc);
	this.frame.removeEventListener("mousedown", this.mdownfunc);
	if (this.onclose) {
		this.onclose();
	}
};

/* Window X/Y is specified on window.x, window.y */
export function addWindow(window) {
	var realWindow = window.getWindow();
	if(!windowSys.windows[realWindow.title]) {
		elements.windows.appendChild(realWindow.frame);
		windowSys.windows[realWindow.title] = realWindow;
	}
	eventSys.emit(e.misc.windowAdded, window);
	return window;
}

export function delWindow(window) {
	var realWindow = window.getWindow();
	if(windowSys.windows[realWindow.title]) {
		elements.windows.removeChild(realWindow.frame);
		delete windowSys.windows[realWindow.title];
	}
	return window;
}

export function centerWindow(win) {
	win = win.getWindow();
	win.move(window.innerWidth / 2 - win.realw / 2 | 0, window.innerHeight / 2 - win.realh / 2 | 0);
}

/*eventSys.init("init", function() {
	this.windiv = document.getElementById("windows");
}.bind(WorldOfPixels.windowsys));*/
