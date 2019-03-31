"use strict";
import { elements } from './main.js';
import { EVENTS as e, options } from './conf.js';
import { PublicAPI, eventSys } from './global.js';
import { mkHTML, waitFrames } from './util/misc.js';

export const windowSys = {
	windows: {},
	class: {
		input: UtilInput,
		dialog: UtilDialog,
		dropDown: OWOPDropDown,
		window: GUIWindow
	},
	addWindow: addWindow,
	delWindow: delWindow,
	centerWindow: centerWindow,
	closeAllWindows: closeAllWindows
};

PublicAPI.windowSys = windowSys;

function closeAllWindows() {
	for (var x in windowSys.windows) {
		windowSys.windows[x].close();
	}
}

export function UtilInput(title, message, inputType, cb) {
	this.win = new GUIWindow(title, {
		centerOnce: true,
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
	}.bind(this)).resize(200, 60);
}

UtilInput.prototype.getWindow = function() {
	return this.win;
};

export function UtilDialog(title, message, canClose, cb) {
	this.win = new GUIWindow(title, {
		centered: true,
		closeable: canClose
	}, function(win) {
		this.messageBox = win.addObj(mkHTML("span", {
			className: "whitetext",
			style: "display: block; padding-bottom: 4px;",
			innerHTML: message
		}));
		this.okButton = win.addObj(mkHTML("button", {
			innerHTML: "OK",
			style: "display: block; width: 80px; height: 30px; margin: auto;",
			onclick: function() {
				cb();
				this.getWindow().close();
			}.bind(this)
		}));
	}.bind(this));
}

UtilDialog.prototype.getWindow = function() {
	return this.win;
};

/* Highly specific purpose, should only be created once */
export function OWOPDropDown() {
	this.win = new GUIWindow(null, {
		immobile: true
	},
	function(win) {
		win.frame.className = "owopdropdown";
		win.container.style.cssText = "border: none;\
			background-color: initial;\
			pointer-events: none;\
			margin: 0;";
		var hlpdiv = win.addObj(mkHTML("div", {
			className: "winframe",
			style: "padding: 0;\
				width: 68px; height: 64px;"
		}));
		var hidebtn = win.addObj(mkHTML("button", {
			innerHTML: 'hi'
			/*className: "winframe",
			style: "padding: 0;\
			background-color: #ffd162;\
			left: -6px; top: 70px;\
			width: 38px; height: 36px;"*/
		}));
		/*var rddtbtn = win.addObj(mkHTML("button", {
			className: "winframe",
			style: "padding: 0;\
			right: -6px; top: 70px;\
			width: 38px; height: 36px;"
		}));*/
		var hlpcontainer = mkHTML("div", {
			className: "wincontainer",
			style: "margin-top: -5px;"
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
	}).resize(68, 64);
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
	this.container.className = 'wincontainer';

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
		if (e.target === this.frame && !this.opt.immobile) {
			this.currentaction = function(x, y) {
				x = x <= 0 ? 0 : x > window.innerWidth ? window.innerWidth : x;
				y = y <= 0 ? 0 : y > window.innerHeight ? window.innerHeight : y;
				this.move(x - offx, y - offy);
			}
		}
	}.bind(this);

	if (options.centerOnce) {
		/* Ugly solution to wait for offset(Height, Width) values to be available */
		this.move(window.innerWidth, window.innerHeight); /* Hide the window */
		waitFrames(2, () => centerWindow(this));
	}

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

	this.touchfuncbuilder = function(type) {
		return (event) => {
			var handlers = {
				start: this.mdownfunc,
				move: this.mmovefunc,
				end: this.mupfunc,
				cancel: this.mupfunc
			};
			var handler = handlers[type];
			if (handler) {
				var touches = event.changedTouches;
				if (touches.length > 0) {
					handler(touches[0]);
				}
			}
		};
	}.bind(this);

	this.frame.addEventListener("touchstart", this.touchfuncbuilder("start"));
	this.frame.addEventListener("touchmove", this.touchfuncbuilder("move"));
	this.frame.addEventListener("touchend", this.touchfuncbuilder("end"));
	this.frame.addEventListener("touchcancel", this.touchfuncbuilder("cancel"));

	if(options.closeable) {
		this.frame.appendChild(mkHTML("button", {
			onclick: function() {
				this.close();
			}.bind(this),
			className: 'windowCloseButton'
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
	delWindow(this);
	window.removeEventListener("mousemove", this.mmovefunc);
	window.removeEventListener("mouseup", this.mupfunc);
	this.frame.removeEventListener("mousedown", this.mdownfunc);
	if (this.onclose) {
		this.onclose();
	}
};

/* Window X/Y is specified on window.x, window.y */
export function addWindow(window) {
	if (options.noUi) {
		return window;
	}

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
