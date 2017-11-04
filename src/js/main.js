/*
 * TODO:
 *   Mabye bookmarks
 *   IE support by adding .cur cursors
 */
 /* NOTE: Let's stick with the correct way of storing colors, 
  * first byte should be red value: 0xAABBGGRR, or [r, g, b]
  */
'use strict';
import { CHUNK_SIZE, EVENTS as e } from './conf.js';
import { Bucket } from './util/Bucket.js';
import { escapeHTML, getTime, getCookie, cookiesEnabled, loadScript } from './util/misc.js';

import { eventSys, PublicAPI } from './global.js';
import { options } from './conf.js';
import { World } from './World.js';
import { camera, renderer, moveCameraBy } from './canvas_renderer.js';
import { net } from './networking.js';
import { updateClientFx, player } from './local_player.js';
import { resolveProtocols } from './protocol/all.js';
import { windowSys } from './windowsys.js';

export { showDevChat, statusMsg };

export const keysDown = {};

export const mouse = {
	x: 0, /* pageX */
	y: 0, /* pageY */
	lastX: 0,
	lastY: 0,
	get worldX() { return camera.x * 16 + this.x / (camera.zoom / 16); },
	get worldY() { return camera.y * 16 + this.y / (camera.zoom / 16); },
	mouseDownWorldX: 0,
	mouseDownWorldY: 0,
	get tileX() { return Math.floor(this.worldX / 16); },
	get tileY() { return Math.floor(this.worldY / 16); },
	buttons: 0,
	validTile: false,
	insideViewport: false,
	touches: [],
	cancelMouseDown: function() { this.buttons = 0; }
};

export const elements = {
	viewport: null,
	xyDisplay: null,
	chatInput: null,
	chat: null,
	devChat: null
};

export const misc = {
	_world: null,
	chatRecvModifier: msg => msg,
	chatSendModifier: msg => msg,
	exceptionTimeout: null,
	tick: 0,
	urlWorldName: null,
	connecting: false,
	tickInterval: null,
	lastMessage: null,
	lastCleanup: 0,
	set world(value) {
		/* The reason this is done is because the old functions may reference the old world object */
		PublicAPI.world = getNewWorldApi();
		return this._world = value;
	},
	get world() { return this._world; },
	guiShown: false,
	cookiesEnabled: cookiesEnabled(),
	/* TODO: Make nag appear if this is set, and reCaptcha is going to be loaded (not after) */
	showEUCookieNag: cookiesEnabled() && getCookie("nagAccepted") !== "true"
};

function getNewWorldApi() {
	var obj = {};
	var defProp = function(prop) {
		Object.defineProperty(obj, prop, {
			get: function() { return misc.world && this['_' + prop] || (this['_' + prop] = misc.world[prop].bind(misc.world)); }
		});
	};
	defProp('getPixel');
	defProp('setPixel');
	defProp('undo');
	defProp('unloadFarChunks');
	return obj;
}

function receiveMessage(text) {
	console.log(text);
	text = misc.chatRecvModifier(text);
	if (!text) {
		return;
	}

	var message = document.createElement("li");
	var idIndex = text.indexOf(': '); /* This shouldn't be like this, change on proto switch */
	var realText = text;
	if (idIndex !== -1) {
		var ntext = text.substr(0, idIndex);
		realText = ntext.replace(/\d+/g, '') + text.slice(idIndex + 2);
	}
	var span = document.createElement("span");
	if (misc.lastMessage && misc.lastMessage.text === realText) {
		misc.lastMessage.incCount();
	} else {
		misc.lastMessage = {
			get text() { return realText; },
			incCount: () => {
				var times = span.recvTimes || 1;
				span.innerHTML = `${text} [x${++times}]`;
				span.recvTimes = times;
			}
		};
		text = escapeHTML(text);
		span.innerHTML = text;
		message.appendChild(span);
		elements.chatMessages.appendChild(message);
		var childs = elements.chatMessages.children;
		if (childs.length > 256) {
			childs[0].remove();
		}
	}
	scrollChatToBottom();
}

function receiveDevMessage(text) {
	var message = document.createElement("li");
	var span = document.createElement("span");
	span.innerHTML = text;
	message.appendChild(span);
	elements.devChatMessages.appendChild(message);
	elements.devChatMessages.scrollTop = elements.devChatMessages.scrollHeight;
}

function scrollChatToBottom() {
	elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function clearChat() {
	elements.chatMessages.innerHTML = "";
	elements.devChatMessages.innerHTML = "";
}

function tick() {
	var tickNum = ++misc.tick;
	var offX = 0;
	var offY = 0;
	var offZoom = 0;
	if (keysDown[107] || keysDown[187]) { /* numpad + || equal sign + */
		offZoom += 1;
		keysDown[107] = keysDown[187] = false;
	}
	if (keysDown[109] || keysDown[189]) {
		offZoom -= 1;
		keysDown[109] = keysDown[189] = false; /* Only register keydown */
	}
	if (keysDown[38]) { // Up
		offY -= options.movementSpeed / options.tickSpeed;
	}
	if (keysDown[37]) { // Left
		offX -= options.movementSpeed / options.tickSpeed;
	}
	if (keysDown[40]) { // Down
		offY += options.movementSpeed / options.tickSpeed;
	}
	if (keysDown[39]) { // Right
		offX += options.movementSpeed / options.tickSpeed;
	}
	if (offX !== 0 || offY !== 0 || offZoom !== 0) {
		moveCameraBy(offX, offY);
		camera.zoom = camera.zoom + offZoom;
		updateMouse(null, 'mousemove', mouse.x, mouse.y);
	}

	eventSys.emit(e.tick, tickNum);
}

function updateMouse(event, eventName, mouseX, mouseY) {
	mouse.x = mouseX;
	mouse.y = mouseY;
	
	var tool = player.tool;
	if (tool !== null && misc.world !== null) {
		player.tool.call(eventName, [mouse, event]);

		if (updateClientFx()) {
			updateXYDisplay(mouse.tileX, mouse.tileY);
		}
	}
}

function openChat() {
	elements.chat.className = "active selectable";
	elements.devChat.className = "active selectable";
	scrollChatToBottom();
}

function closeChat() {
	elements.chat.className = "";
	elements.devChat.className = "";
	elements.chatInput.blur();
	scrollChatToBottom();
}

function showDevChat(bool) {
	elements.devChat.style.display = bool ? "" : "none";
}

function updateXYDisplay(x, y) {
	elements.xyDisplay.innerHTML = "X: " + x + ", Y: " + y;
}

function updatePlayerCount(count) {
	elements.playerCountDisplay.innerHTML = count + ' cursor' + (count !== 1 ? 's online' : ' online');
}
/*
function openServerSelector() {
	windowsys.addWindow(new GUIWindow(0, 0, 250, 60, "Select a server", {
			centered: true
		}, wdow => {

		wdow.addObj(mkHTML("button", {
			innerHTML: "Original server",
			style: "width: 100%; height: 50%",
			onclick: () => {
				w.options.serverAddress = "ws://ourworldofpixels.com:443";
				w.net.connect();
				win.wm.delWindow(win);
				w.options.oldserver = true;
			}
		}));
		wdow.addObj(mkHTML("button", {
			innerHTML: "Beta server",
			style: "width: 100%; height: 50%",
			onclick: () => {
				w.options.serverAddress = "ws://vanillaplay.ddns.net:25565";
				w.net.connect();
				win.wm.delWindow(win);
			}
		}));
		wdow.addObj(mkHTML("button", {
			innerHTML: "Localhost",
			style: "width: 100%; height: 50%",
			onclick: () => {
				w.options.serverAddress = "ws://localhost:25565";
				w.net.connect();
				win.wm.delWindow(win);
			}
		}));
		wdow.addObj(mkHTML("button", {
			innerHTML: "Custom server",
			style: "width: 100%; height: 50%",
			onclick: function() {
				var i = win.wm.addWindow(
					new UtilInput("Enter server address", "Type here...", "text", function(addr) {
						w.options.serverAddress = addr;
						w.net.connect();
						win.close();
					}.bind({w: w, win: win}))
				);
				win.onclose = function() {
					i.getWindow().close();
				}
			}.bind({w: this, win: wdow})
		}));
	}));
}
*/
function logoMakeRoom(bool) {
	elements.loadUl.style.transform = bool ? "translateY(-75%) scale(0.5)" : "";
}

function showWorldUI(bool) {
	misc.guiShown = bool;
	elements.xyDisplay.style.transform = bool ? "initial" : "";
	elements.playerCountDisplay.style.transform = bool ? "initial" : "";
	elements.palette.style.transform = bool ? "translateY(-50%)" : "";
	elements.chat.style.transform = bool ? "initial" : "";
	elements.chatInput.disabled = !bool;
}

function showLoadScr(bool, showOptions) {
	elements.loadOptions.className = showOptions ? "framed" : "hide";
	if (!bool) {
		elements.loadScr.style.transform = "translateY(-110%)"; /* +10% for shadow */
		setTimeout(() => elements.loadScr.className = "hide", 2000);
	} else {
		elements.loadScr.className = "";
		elements.loadScr.style.transform = "";
	}
}

function statusMsg(showSpinner, message) {
	const statusShown = elements.status.isConnected;
	if (message === null) {
		elements.status.style.display = "none";
		return;
	} else {
		elements.status.style.display = "";
	}
	elements.statusMsg.innerHTML = message;
	elements.spinner.style.display = showSpinner ? "" : "none";
}

function inGameDisconnected() {
	showWorldUI(false);
	showLoadScr(true, true);
	statusMsg(false, "Lost connection with the server.");
	misc.world = null;
}

function retryingConnect(server, worldName) {
	if (misc.connecting && !net.isConnected()) { /* We're already connected/trying to connect */
		return;
	}
	misc.connecting = true;
	const tryConnect = (tryN) => {
		eventSys.once(e.net.connecting, () => {
			statusMsg(true, "Connecting...");
			showLoadScr(true, false);
		});
		net.connect(server, worldName);
		const disconnected = () => {
			++tryN;
			statusMsg(true, `Could not connect to server, retrying... (${tryN})`);
			setTimeout(tryConnect, Math.min(tryN * 2000, 10000), tryN);
			eventSys.removeListener(e.net.connected, connected);
		};
		const connected = () => {
			statusMsg(false, "Connected!");
			eventSys.removeListener(e.net.disconnected, disconnected);
			eventSys.once(e.net.disconnected, inGameDisconnected);
			misc.connecting = false;
		};

		eventSys.once(e.net.connected, connected);
		eventSys.once(e.net.disconnected, disconnected);
	};
	tryConnect(0);
}

function checkFunctionality(callback) {
	/* Multi Browser Support */
	window.requestAnimationFrame =
		window.requestAnimationFrame ||
		window.mozRequestAnimationFrame ||
		window.webkitRequestAnimationFrame ||
		window.msRequestAnimationFrame ||
		function(f) {
			setTimeout(f, 1000 / options.fps);
		};

	/* I don't think this is useful anymore,
	 * since too much stuff used doesn't work on very old browsers.
	 ***/
	if (typeof Uint8Array.prototype.join === "undefined") {
		Uint8Array.prototype.join = function(e) {
			if (typeof e === "undefined") {
				e = ',';
			} else if (typeof e !== "string") {
				e = e.toString();
			}
			var str = "";
			var i = 0;
			do {
				str += this[i] + e;
			} while (++i < length - 1);
			return str + this[i];
		};
	}

	var toBlob = HTMLCanvasElement.prototype.toBlob = HTMLCanvasElement.prototype.toBlob || HTMLCanvasElement.prototype.msToBlob;
	
	if (!toBlob) { /* Load toBlob polyfill */
		loadScript(require('./polyfill/canvas-toBlob.js'), callback);
	} else {
		callback();
	}
}

function init() {
	var viewport = elements.viewport;
	var chatinput = elements.chatInput;

	misc.lastCleanup = 0;
	
	viewport.oncontextmenu = () => false;

	viewport.addEventListener("mouseenter", () => {
		mouse.insideViewport = true;
		updateClientFx(true);
	});
	viewport.addEventListener("mouseleave", () => {
		mouse.insideViewport = false;
		updateClientFx(true);
	});

	chatinput.addEventListener("keyup", event => {
		var keyCode = event.which || event.keyCode;
		if (keyCode === 27) {
			closeChat();
		} else if (keyCode == 13) {
			var text = chatinput.value;
			if (text[0] !== '/') {
				text = misc.chatSendModifier(text);
			}
			net.protocol.sendMessage(text);
			chatinput.value = '';
			closeChat();
			event.stopPropagation();
		}
	});
	chatinput.addEventListener("focus", event => {
		if (!mouse.buttons) {
			openChat();
		} else {
			chatinput.blur();
		}
	});

	window.addEventListener("keydown", event => {
		var keyCode = event.which || event.keyCode;
		if (document.activeElement.tagName !== "INPUT" && misc.world !== null) {
			keysDown[keyCode] = true;
			var tool = player.tool;
			if (tool !== null && misc.world !== null && tool.call('keydown', [keysDown, event])) {
				return false;
			}
			switch (keyCode) {
				case 16: /* Shift */
					player.tool = "move";
					break;

				case 90: /* Ctrl + Z */
					if (!event.ctrlKey || !misc.world) {
						break;
					}
					misc.world.undo();
					event.preventDefault();
					break;

				case 70: /* F */
					var nrgb = [];
					var valid = true;
					var first = true;
					var prmpt = true;
					for(var i = 0; i < 3; i++){
						if (prmpt) {
							nrgb[i] = prompt("Custom color\n" + ["Red", "Green", "Blue"][i] + " value: (0-255)" + (first ? "\n(Or just type three values separated by a comma: r,g,b)\n(...or the hex string: #RRGGBB)" : ""));
						}
						if (first && nrgb[i]) {
							var tmp = nrgb[i].split(',');
							if (tmp.length == 3) {
								nrgb = tmp;
								prmpt = false;
							} else if (nrgb[i][0] == '#' && nrgb[i].length == 7) {
								var colr = parseInt(nrgb[i].replace('#', '0x'));
								/* The parsed HTML color doesn't have red as the first byte, so invert it. */
								nrgb = [colr >> 16 & 0xFF, colr >> 8 & 0xFF, colr & 0xFF];
								prmpt = false;
							}
						}
						first = false;
						nrgb[i] = parseInt(nrgb[i]);
						if(!(Number.isInteger(nrgb[i]) && nrgb[i] >= 0 && nrgb[i] < 256)){
							valid = false;
							break; /* Invalid color */
						}
					}
					if (valid) {
						player.selectedColor = nrgb;
					}
					break;

				case 71: /* G */
					renderer.showGrid(!renderer.gridShown);
					break;

				case 112: /* F1 */
					showWorldUI(!misc.guiShown);
					event.preventDefault();
					break;

				default:
					return true;
					break;
			}
			return false;
		}
	});
	window.addEventListener("keyup", event => {
		var keyCode = event.which || event.keyCode;
		delete keysDown[keyCode];
		if (document.activeElement.tagName !== "INPUT") {
			var tool = player.tool;
			if (!(tool !== null && misc.world !== null && tool.call('keyup', [keysDown, event]))) {
				if (keyCode == 13) {
					elements.chatInput.focus();
				} else if (keyCode == 16) {
					player.tool = "cursor";
				}
			}
		}
	});
	viewport.addEventListener("mousedown", event => {
		closeChat();
		mouse.lastX = mouse.x;
		mouse.lastY = mouse.y;
		mouse.x = event.pageX;
		mouse.y = event.pageY;
		mouse.mouseDownWorldX = mouse.worldX;
		mouse.mouseDownWorldY = mouse.worldY;
		mouse.buttons = event.buttons;

		var tool = player.tool;
		if (tool !== null && misc.world !== null) {
			player.tool.call('mousedown', [mouse, event]);
		}
	});

	window.addEventListener("mouseup", event => {
		mouse.buttons = event.buttons;
		var tool = player.tool;
		if (tool !== null && misc.world !== null) {
			player.tool.call('mouseup', [mouse, event]);
		}
	});

	window.addEventListener("mousemove", event => {
		updateMouse(event, 'mousemove', event.pageX, event.pageY);
	});

	const mousewheel = event => {
		/*if (player.tool !== null && misc.world !== null) {
			player.tool.call('scroll', [mouse, event]);
		}*/
		var delta = Math.max(-1, Math.min(1, (event.deltaY || event.detail)));
		var pIndex = player.paletteIndex;
		if (delta > 0) {
			pIndex++;
		} else {
			pIndex--;
		}
		player.paletteIndex = pIndex;
	};

	viewport.addEventListener("wheel", mousewheel, { passive: true });
	viewport.addEventListener("wheel", e => {
		e.preventDefault();
		return false;
	}, { passive: false });
	if (!('onwheel' in document)) {
		viewport.addEventListener("DOMMouseScroll", mousewheel); /* Old Firefox */
	}
	
	// Touch support
	const touchEventNoUpdate = evtName => event => {
		var tool = player.tool;
		mouse.buttons = 0;
		if (tool !== null && misc.world !== null) {
			player.tool.call(evtName, [mouse, event]);
		}
	};
	viewport.addEventListener("touchstart", event => {
		var moved = event.changedTouches[0];
		mouse.buttons = 1;
		if (moved) {
			updateMouse(event, 'touchstart', moved.pageX, moved.pageY);
			mouse.mouseDownWorldX = mouse.worldX;
			mouse.mouseDownWorldY = mouse.worldY;
		}
	}, { passive: true });
	viewport.addEventListener("touchmove", event => {
		var moved = event.changedTouches[0];
		if (moved) {
			updateMouse(event, 'touchmove', moved.pageX, moved.pageY);
		}
	}, { passive: true });
	viewport.addEventListener("touchend", touchEventNoUpdate('touchend'), { passive: true });
	viewport.addEventListener("touchcancel", touchEventNoUpdate('touchcancel'), { passive: true });
	
	// Some cool custom css
	console.log("%c" +
		" _ _ _         _   _    _____ ___    _____ _         _     \n" +
		"| | | |___ ___| |_| |  |     |  _|  |  _  |_|_ _ ___| |___ \n" +
		"| | | | . |  _| | . |  |  |  |  _|  |   __| |_'_| -_| |_ -|\n" +
		"|_____|___|_| |_|___|  |_____|_|    |__|  |_|_,_|___|_|___|",
		"font-size: 15px; font-weight: bold;"
	);
	console.log("%cWelcome to the developer console!", "font-size: 20px; font-weight: bold; color: #F0F;");
	
	//this.windowsys.addWindow(new OWOPDropDown());
	resolveProtocols();
	
	/* Calls other initialization functions */
	eventSys.emit(e.init);

	updateXYDisplay(0, 0);

	misc.urlWorldName = decodeURIComponent(window.location.pathname).replace(/^(\/beta(?:\/)|\/)/g, "");

	const defaultServer = (serverList => {
		for (var i = 0; i < serverList.length; i++) {
			if (serverList[i].default) {
				return serverList[i];
			}
		}
		return null;
	})(options.serverAddress);
	
	retryingConnect(defaultServer, misc.urlWorldName);

	elements.reconnectBtn.onclick = () => retryingConnect(defaultServer, misc.urlWorldName);

	misc.tickInterval = setInterval(tick, 1000 / options.tickSpeed);
}

eventSys.once(e.loaded, () => statusMsg(true, "Initializing..."));
eventSys.once(e.misc.logoMakeRoom, () => {
	statusMsg(false, null);
	logoMakeRoom();
});

eventSys.once(e.loaded, init);
eventSys.on(e.net.playerCount, updatePlayerCount);

eventSys.on(e.net.chat, receiveMessage);
eventSys.on(e.net.devChat, receiveDevMessage);

eventSys.on(e.misc.windowAdded, window => {
	if (misc.world === null) {
		statusMsg(false, null);
		logoMakeRoom(true);
	}
});

eventSys.on(e.net.world.joining, name => {
	logoMakeRoom(false);
	console.log(`Joining world: ${name}`);
});

eventSys.on(e.net.world.join, world => {
	showLoadScr(false, false);
	showWorldUI(true);
	misc.world = new World(world);
	eventSys.emit(e.misc.worldInitialized);
});

eventSys.on(e.net.connected, () => {
	clearChat();
});

eventSys.on(e.camera.moved, camera => {
	var time = getTime();
	if (misc.world !== null && time - misc.lastCleanup > 1000) {
		misc.lastCleanup = time;
		renderer.unloadFarClusters();
	}
});

window.addEventListener("error", e => {
	showDevChat(true);
	var errmsg = e && e.error ? (e.error.message || e.error.stack) : e.message || "Unknown error occurred";
	errmsg = escapeHTML(errmsg);
	errmsg = errmsg.split('\n');
	for (var i = 0; i < errmsg.length; i++) {
		/* Should be some kind of dissapearing notification instead */
		receiveDevMessage(errmsg[i]);
	}
	if (!misc.isAdmin) { /* TODO */
		if (misc.exceptionTimeout) {
			clearTimeout(misc.exceptionTimeout);
		}
		misc.exceptionTimeout = setTimeout(() => showDevChat(false), 5000);
	}
});

window.addEventListener("load", () => {
	if (window.location.hostname.indexOf("cursors.me") != -1 ||
		window.location.hostname.indexOf("yourworldofpixels.com") != -1) {
		// Redirects to the main url if played on an alternative url.
		window.location.href = "http://www.ourworldofpixels.com/";
		return;
	}

	elements.loadScr = document.getElementById("load-scr");
	elements.loadUl = document.getElementById("load-ul");
	elements.loadOptions = document.getElementById("load-options");
	elements.reconnectBtn = document.getElementById("reconnect-btn");
	elements.spinner = document.getElementById("spinner");
	elements.statusMsg = document.getElementById("status-msg");
	elements.status = document.getElementById("status");
	elements.logo = document.getElementById("logo");

	elements.xyDisplay = document.getElementById("xy-display");
	elements.devChat = document.getElementById("dev-chat");
	elements.chat = document.getElementById("chat");
	elements.devChatMessages = document.getElementById("dev-chat-messages");
	elements.chatMessages = document.getElementById("chat-messages");
	elements.playerCountDisplay = document.getElementById("playercount-display");

	elements.palette = document.getElementById("palette");
	elements.paletteColors = document.getElementById("palette-colors");
	elements.paletteCreate = document.getElementById("palette-create");
	
	elements.animCanvas = document.getElementById("animations");

	elements.viewport = document.getElementById("viewport");
	elements.windows = document.getElementById("windows");

	elements.chatInput = document.getElementById("chat-input");

	checkFunctionality(() => eventSys.emit(e.loaded));
});

/* Public API definitions */
PublicAPI.events = eventSys;
PublicAPI.elements = elements;
PublicAPI.mouse = mouse;
PublicAPI.world = getNewWorldApi();
PublicAPI.chat = {
	send: (msg) => net.protocol && net.protocol.sendMessage(msg),
	get recvModifier() { return misc.chatRecvModifier; },
	set recvModifier(fn) { misc.chatRecvModifier = fn; },
	get sendModifier() { return misc.chatSendModifier; },
	set sendModifier(fn) { misc.chatSendModifier = fn; }
};