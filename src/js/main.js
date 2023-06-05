/*
 * TODO List: https://trello.com/b/v6F6isSv/worldofpixels
 * NOTE: Let's stick with the correct way of storing colors,
 * first byte should be red value: 0xAABBGGRR, or [r, g, b]
 */
'use strict';
import { normalizeWheel } from './util/normalizeWheel.js';
import anchorme from './util/anchorme.js';

import { CHUNK_SIZE, EVENTS as e, RANK } from './conf.js';
import { Bucket } from './util/Bucket.js';
import { escapeHTML, getTime, getCookie, setCookie, cookiesEnabled, storageEnabled, loadScript, eventOnce } from './util/misc.js';

import { eventSys, PublicAPI, AnnoyingAPI as aa, wsTroll } from './global.js';
import { options } from './conf.js';
import { World } from './World.js';
import { camera, renderer, moveCameraBy } from './canvas_renderer.js';
import { net } from './networking.js';
import { updateClientFx, player } from './local_player.js';
import { resolveProtocols, definedProtos } from './protocol/all.js';
import { windowSys, GUIWindow, OWOPDropDown, UtilDialog } from './windowsys.js';

import { createContextMenu } from './context.js';

import launchSoundUrl from '../audio/launch.mp3';
import placeSoundUrl from '../audio/place.mp3';
import clickSoundUrl from '../audio/click.mp3';

export { showDevChat, showPlayerList, statusMsg };

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
	cancelMouseDown: function () { this.buttons = 0; }
};

export const elements = {
	viewport: null,
	xyDisplay: null,
	chatInput: null,
	chat: null,
	devChat: null
};

export const misc = {
	localStorage: storageEnabled() && window.localStorage,
	_world: null,
	lastXYDisplay: [-1, -1],
	devRecvReader: msg => {},
	chatPostFormatRecvModifier: msg => msg,
	chatRecvModifier: msg => msg,
	chatSendModifier: msg => msg,
	exceptionTimeout: null,
	worldPasswords: {},
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
	storageEnabled: storageEnabled(),
	showEUCookieNag: !options.noUi && cookiesEnabled() && getCookie("nagAccepted") !== "true",
	usingFirefox: navigator.userAgent.indexOf("Firefox") !== -1,
	donTimer: 0
};

export const sounds = {
	play: function (sound) {
		sound.currentTime = 0;
		if (options.enableSounds) {
			sound.play();
		}
	}
};
sounds.launch = new Audio();
sounds.launch.src = launchSoundUrl;
sounds.place = new Audio();
sounds.place.src = placeSoundUrl;
sounds.click = new Audio();
sounds.click.src = clickSoundUrl;

export var playerList = {};
export var playerListTable = document.createElement("table");
export var playerListWindow = new GUIWindow('Players', {closeable: true}, wdow => {
	var tableHeader = document.createElement("tr");
	tableHeader.innerHTML = "<th>Id</th><th>X</th><th>Y</th>";
	playerListTable.appendChild(tableHeader);
	wdow.container.appendChild(playerListTable);
	wdow.container.id = "player-list";
}).move(window.innerWidth - 240, 32);

function getNewWorldApi() {
	var obj = {
		get name() { return misc.world.name; }
	};
	var defProp = function (prop) {
		Object.defineProperty(obj, prop, {
			get: function () { return misc.world && this['_' + prop] || (this['_' + prop] = misc.world[prop].bind(misc.world)); }
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

	var addContext = (elem, nickname, id) => {
		elem.addEventListener("click", function(event) {
			createContextMenu(event.clientX, event.clientY, [
				["Mute " + nickname, function() {
					PublicAPI.muted.push(id);
					receiveMessage("<span style=\"color: #ffa71f\">Muted " + id + "</span>");
				}]
			]);
			event.stopPropagation();
		});
	};

	var message = document.createElement("li");
	var realText = text;
	var isAdmin = false;
	if (text.startsWith("[D]")) {
		message.className = "discord";
		var nick = document.createElement("span");
		nick.className = "nick";
		var nickname = text.split(": ")[0] + ": ";
		nick.innerHTML = escapeHTML(nickname);
		message.appendChild(nick);
		text = text.slice(nickname.length);
	} else if (text.startsWith("[Server]") || text.startsWith("Server:") || text.startsWith("Nickname set to") || text.startsWith("User: ")) {
		message.className = "server";
	} else if (text.startsWith("->")) {
		var cuttxt = text.slice(3);
		var id = parseInt(cuttxt);
		cuttxt = cuttxt.slice(id.toString().length);
		if (cuttxt.startsWith(" tells you: ")) {
			if (PublicAPI.muted.includes(id)) {
				return;
			}

			var nick = document.createElement("span");
			nick.className = "tell";
			nick.innerHTML = escapeHTML(`-> ${id} tells you: `);
			addContext(nick, id, id);
			message.appendChild(nick);
			text = cuttxt.slice(12);
		} else {
			message.className = "tell";
		}
	} else if (text.startsWith("(M)")) {
		message.className = "moderator";
	} else if (isNaN(text.split(": ")[0]) && text.split(": ")[0].charAt(0) != "[") {
		message.className = "admin";
		isAdmin = true;
	} else {
		var nick = document.createElement("span");
		nick.className = "nick";
		var nickname = text.split(": ")[0];
		var id = nickname.startsWith("[") ? nickname.split(" ")[0].slice(1, -1) : nickname;
		id = parseInt(id);
		if (PublicAPI.muted.includes(id)) {
			return;
		}
		nick.innerHTML = escapeHTML(nickname + ": ");
		nick.addEventListener("click", function(event) {
			createContextMenu(event.clientX, event.clientY, [
				["Mute " + nickname, function() {
					PublicAPI.muted.push(id);
					receiveMessage("<span style=\"color: #ffa71f\">Muted " + id + "</span>");
				}]
			]);
			event.stopPropagation();
		});
		message.appendChild(nick);
		text = text.slice(nickname.length + 2);
	}
	var idIndex = text.indexOf(': '); /* This shouldn't be like this, change on proto switch */
	if (idIndex !== -1) {
		var ntext = text.substr(0, idIndex);
		realText = ntext.replace(/\d+/g, '') + text.slice(idIndex + 2);
	}

	if (misc.lastMessage && misc.lastMessage.text === realText) {
		misc.lastMessage.incCount();
	} else {
		var span = document.createElement("span");
		misc.lastMessage = {
			get text() { return realText; },
			incCount: () => {
				var times = span.recvTimes || 1;
				span.innerHTML = `${anchorme(text, {
					attributes: [
						{
							name: "target",
							value: "_blank"
						}
					]
				})} [x${++times}]`;
				span.recvTimes = times;
				message.style.animation = 'none'; /* Reset fading anim */
				message.offsetHeight; /* Reflow */
				message.style.animation = null;
			}
		};
		if (!isAdmin) {
			text = escapeHTML(text).replace(/\&\#x2F;/g, "/");
		}
		var textByNls = text.split('\n');
		var firstNl = textByNls.shift();
		firstNl = firstNl.replace(/(?:&lt;|<)a:(.+?):([0-9]{8,32})(?:&gt;|>)/g, '<img class="emote" src="https://cdn.discordapp.com/emojis/$2.gif?v=1">'); // animated
		firstNl = firstNl.replace(/(?:&lt;|<):(.+?):([0-9]{8,32})(?:&gt;|>)/g,  '<img class="emote" src="https://cdn.discordapp.com/emojis/$2.png?v=1">'); // static
		text = firstNl + '\n' + textByNls.join('\n');
		text = misc.chatPostFormatRecvModifier(text);
		span.innerHTML = anchorme(text, {
			attributes: [
				{
					name: "target",
					value: "_blank"
				}
			]
		});
		message.appendChild(span);
		scrollChatToBottom(() => {
			elements.chatMessages.appendChild(message);
			var childs = elements.chatMessages.children;
			if (childs.length > options.maxChatBuffer) {
				childs[0].remove();
			}
		}, true);
	}
}

function receiveDevMessage(text) {
    try {
        misc.devRecvReader(text);
    } catch(e) {}
	var message = document.createElement("li");
	var span = document.createElement("span");
	span.innerHTML = text;
	message.appendChild(span);
	elements.devChatMessages.appendChild(message);
	elements.devChatMessages.scrollTop = elements.devChatMessages.scrollHeight;
}

function scrollChatToBottom(callback, dontScrollIfNotTop = false) {
	var shouldScroll = !dontScrollIfNotTop || elements.chatMessages.scrollHeight - elements.chatMessages.scrollTop === elements.chatMessages.clientHeight;
	if (callback)
		callback(); // add all elements here
	if (shouldScroll)
		elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function clearChat() {
	elements.chatMessages.innerHTML = "";
	elements.devChatMessages.innerHTML = "";
}

function tick() {
	var tickNum = ++misc.tick;
	var speed = Math.max(Math.min(options.movementSpeed, 64), 0);
	var offX = 0;
	var offY = 0;
	if (keysDown[38]) { // Up
		offY -= speed;
	}
	if (keysDown[37]) { // Left
		offX -= speed;
	}
	if (keysDown[40]) { // Down
		offY += speed;
	}
	if (keysDown[39]) { // Right
		offX += speed;
	}
	if (offX !== 0 || offY !== 0) {
		moveCameraBy(offX, offY);
		updateMouse(null, 'mousemove', mouse.x, mouse.y);
	}

	eventSys.emit(e.tick, tickNum);
	if (player.tool !== null && misc.world !== null) {
		player.tool.call('tick', mouse);
	}
}

function updateMouse(event, eventName, mouseX, mouseY) {
	mouse.x = mouseX;
	mouse.y = mouseY;
	var cancelled = 0;
	if (misc.world !== null) {
		mouse.validTile = misc.world.validMousePos(mouse.tileX, mouse.tileY);
		if (player.tool !== null) {
			cancelled = player.tool.call(eventName, [mouse, event]);
		}
		if (updateXYDisplay(mouse.tileX, mouse.tileY)) {
			updateClientFx();
		}
	}
	return cancelled;
}

function openChat() {
	elements.chat.className = "active selectable";
	elements.devChat.className = "active selectable";
	elements.chatMessages.className = "active";
	scrollChatToBottom();
}

function closeChat() {
	elements.chat.className = "";
	elements.devChat.className = "";
	elements.chatMessages.className = "";
	elements.chatInput.blur();
	scrollChatToBottom();
}

function showDevChat(bool) {
	elements.devChat.style.display = bool ? "" : "none";
}

export function revealSecrets(bool) {
	if (bool) {
		PublicAPI.net = net;
		//window.WebSocket = aa.ws;
	} else {
		delete PublicAPI.net;
		//delete PublicAPI.tool;
		//window.WebSocket = wsTroll;
	}
}

function showPlayerList(bool) {
	if (bool) {
		windowSys.addWindow(playerListWindow);
	} else {
		windowSys.delWindow(playerListWindow);
	}
}

function updateXYDisplay(x, y) {
	if (misc.lastXYDisplay[0] !== x || misc.lastXYDisplay[1] !== y) {
		misc.lastXYDisplay = [x, y];
		if(!options.hexCoords) {
			elements.xyDisplay.innerHTML = "X: " + x + ", Y: " + y;
		} else {
			var hexify = i => `${(i < 0 ? '-' : '')}0x${Math.abs(i).toString(16)}`;
			elements.xyDisplay.innerHTML = `X: ${hexify(x)}, Y: ${hexify(y)}`;
		}
		return true;
	}
	return false;
}

function updatePlayerCount() {
	var text = ' cursor' + (misc.playerCount !== 1 ? 's online' : ' online');
	var countStr = '' + misc.playerCount;
	if (misc.world && 'maxCount' in misc.world) {
		countStr += '/' + misc.world.maxCount;
	}

	var final = countStr + text;
	elements.playerCountDisplay.innerHTML = final;

	var title = 'World of Pixels';
	if (misc.world) {
		title = '(' + countStr + '/' + misc.world.name + ') ' + title;
	}

	document.title = title;
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
	elements.chatInput.style.display = "initial";
	elements.paletteBg.style.visibility = bool ? "" : "hidden";
	elements.helpButton.style.visibility = bool ? "" : "hidden";
	elements.topRightDisplays.classList[bool ? 'remove' : 'add']('hideui');
}

function showLoadScr(bool, showOptions) {
	elements.loadOptions.className = showOptions ? "framed" : "hide";
	if (!bool) {
		elements.loadScr.style.transform = "translateY(-110%)"; /* +10% for shadow */
		eventOnce(elements.loadScr, "transitionend webkitTransitionEnd oTransitionEnd msTransitionEnd",
		() => {
			if (net.isConnected()) {
				elements.loadScr.className = "hide";
			}
		});
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
	elements.chat.style.transform = "initial";
	elements.chatInput.style.display = "";
}

export function retryingConnect(serverGetter, worldName, token) {
	if (misc.connecting && !net.isConnected()) { /* We're already connected/trying to connect */
		return;
	}
	misc.connecting = true;
	var currentServer = serverGetter(false);
	const tryConnect = (tryN) => {
		if (tryN >= (currentServer.maxRetries || 3)) {
			var ncs = serverGetter(true);
			if (ncs != currentServer) {
				currentServer = ncs;
				tryN = 0;
			}
		}
		eventSys.once(e.net.connecting, () => {
			console.debug(`Trying '${currentServer.title}'...`)
			statusMsg(true, `Connecting to '${currentServer.title}'...`);
			showLoadScr(true, false);
		});
		net.connect(currentServer, worldName, token);
		const disconnected = () => {
			++tryN;
			statusMsg(true, `Couldn't connect to server${tryN >= 5 ? ". Your IP may have been flagged as a proxy (or banned). Proxies are disallowed on OWOP due to bot abuse, sorry. R" : ", r"}etrying... (${tryN})`);
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

function saveWorldPasswords() {
	if (misc.storageEnabled) {
		misc.localStorage.worldPasswords = JSON.stringify(misc.worldPasswords);
	}
}

function checkFunctionality(callback) {
	/* Multi Browser Support */
	window.requestAnimationFrame =
		window.requestAnimationFrame ||
		window.mozRequestAnimationFrame ||
		window.webkitRequestAnimationFrame ||
		window.msRequestAnimationFrame ||
		function (f) {
			setTimeout(f, 1000 / options.fallbackFps);
		};

	Number.isInteger = Number.isInteger || (n => Math.floor(n) === n && Math.abs(n) !== Infinity);
	Math.trunc = Math.trunc || (n => n | 0);

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

	if (misc.storageEnabled && misc.localStorage.worldPasswords) {
		try {
			misc.worldPasswords = JSON.parse(misc.localStorage.worldPasswords);
		} catch (e) { }
	}

	misc.lastCleanup = 0;

	viewport.oncontextmenu = () => false;

	viewport.addEventListener("mouseenter", () => {
		mouse.insideViewport = true;
		updateClientFx();
	});
	viewport.addEventListener("mouseleave", () => {
		mouse.insideViewport = false;
		updateClientFx();
	});

	var chatHistory = [];
	var historyIndex = 0;
	chatinput.addEventListener("keydown", event => {
		event.stopPropagation();
		var keyCode = event.which || event.keyCode;
		if (historyIndex === 0 || keyCode == 13 && !event.shiftKey) {
			chatHistory[0] = chatinput.value;
		}
		switch (keyCode) {
			case 27:
				closeChat();
				break;
			case 13:
				if (!event.shiftKey) {
					event.preventDefault();
					var text = chatinput.value;
					historyIndex = 0;
					chatHistory.unshift(text);
					if (misc.storageEnabled) {
						if (text.startsWith("/adminlogin ")) {
							misc.localStorage.adminlogin = text.slice(12);
						} else if (text.startsWith("/modlogin ")) {
							misc.localStorage.modlogin = text.slice(10);
						} else if (text.startsWith("/nick")) {
							var nick = text.slice(6);
							if (nick.length) {
								misc.localStorage.nick = nick;
							} else {
								delete misc.localStorage.nick;
							}
						} else if (text.startsWith("/pass ") && misc.world) {
							var pass = text.slice(6);
							misc.worldPasswords[net.protocol.worldName] = pass;
							saveWorldPasswords();
						}
					}
					if (!event.ctrlKey) {
						text = misc.chatSendModifier(text);
					}
					net.protocol.sendMessage(text);
					chatinput.value = '';
					chatinput.style.height = "16px";
					event.stopPropagation();
				}
				break;
			case 38: // Arrow up
				if (event.shiftKey && historyIndex < chatHistory.length - 1) {
					historyIndex++;
					chatinput.value = chatHistory[historyIndex];
					chatinput.style.height = 0;
					chatinput.style.height = Math.min(chatinput.scrollHeight - 8, 16 * 4) + "px";
				}
				break;
			case 40: // Arrow Down
				if (event.shiftKey && historyIndex > 0) {
					historyIndex--;
					chatinput.value = chatHistory[historyIndex];
					chatinput.style.height = 0;
					chatinput.style.height = Math.min(chatinput.scrollHeight - 8, 16 * 4) + "px";
				}
				break;
		}
	});
	chatinput.addEventListener("keyup", event => {
		event.stopPropagation();
		var keyCode = event.which || event.keyCode;
		if (keyCode == 13 && !event.shiftKey) {
			closeChat();
		}
	})
	chatinput.addEventListener("input", event => {
		chatinput.style.height = 0;
		chatinput.style.height = Math.min(chatinput.scrollHeight - 8, 16 * 4) + "px";
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
			if (tool !== null && misc.world !== null && tool.isEventDefined('keydown')) {
				if (tool.call('keydown', [keysDown, event])) {
					return false;
				}
			}
			switch (keyCode) {
				case 80: /* P */
					player.tool = "pipette";
					break;

				case 79: /* O */
					player.tool = "cursor";
					break;

				case 77: /* M */
				case 16: /* Shift */
					player.tool = "move";
					break;

				case 90: /* Ctrl + Z */
					if (!event.ctrlKey || !misc.world) {
						break;
					}
					misc.world.undo(event.shiftKey);
					event.preventDefault();
					break;

				case 70: /* F */
					var parseClr = clr => {
						var tmp = clr.split(',');
						var nrgb = null;
						if (tmp.length == 3) {
							nrgb = tmp;
							for (var i = 0; i < tmp.length; i++) {
								tmp[i] = +tmp[i];
								if (!(tmp[i] >= 0 && tmp[i] < 256)) {
									return null;
								}
							}
						} else if (clr[0] == '#' && clr.length == 7) {
							var colr = parseInt(clr.replace('#', '0x'));
							/* The parsed HTML color doesn't have red as the first byte, so invert it. */
							nrgb = [colr >> 16 & 0xFF, colr >> 8 & 0xFF, colr & 0xFF];
						}
						return nrgb;
					}
					var input = prompt("Custom color\nType three values separated by a comma: r,g,b\n(...or the hex string: #RRGGBB)\nYou can add multiple colors at a time separating them with a space.");
					if (!input) {
						break;
					}
					input = input.split(' ');
					for (var j = 0; j < input.length; j++) {
						var rgb = parseClr(input[j]);
						if (rgb) {
							player.selectedColor = rgb;
						}
					}

					break;

				case 71: /* G */
					renderer.showGrid(!renderer.gridShown);
					break;

				case 72: /* H */
					options.showProtectionOutlines = !options.showProtectionOutlines;
					renderer.render(renderer.rendertype.FX);
					break;

				case 112: /* F1 */
					showWorldUI(!misc.guiShown);
					event.preventDefault();
					break;

				case 113: /* F2 */
					options.showPlayers = !options.showPlayers;
					renderer.render(renderer.rendertype.FX);
					break;

				case 107:
				case 187:
					++camera.zoom;
					break;

				case 109:
				case 189:
					--camera.zoom;
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
			if (tool !== null && misc.world !== null && tool.isEventDefined('keyup')) {
				if (tool.call('keyup', [keysDown, event])) {
					return false;
				}
			}
			if (keyCode == 13) {
				elements.chatInput.focus();
			} else if (keyCode == 16) {
				player.tool = "cursor";
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
		if ('buttons' in event) {
			mouse.buttons = event.buttons;
		} else {
			var realBtn = event.button;
			if (realBtn === 2) {
				realBtn = 1;
			} else if (realBtn === 1) {
				realBtn = 2;
			}
			mouse.buttons |= 1 << realBtn;
		}

		var tool = player.tool;
		if (tool !== null && misc.world !== null) {
			player.tool.call('mousedown', [mouse, event]);
		}
	});

	window.addEventListener("mouseup", event => {
		/* Old versions of firefox have the buttons property as the
		 * buttons released, instead of the currently pressed buttons.
		 **/
		if ('buttons' in event && !misc.usingFirefox) {
			mouse.buttons = event.buttons;
		} else {
			var realBtn = event.button;
			if (realBtn === 2) {
				realBtn = 1;
			} else if (realBtn === 1) {
				realBtn = 2;
			}
			mouse.buttons &= ~(1 << realBtn);
		}
		var tool = player.tool;
		if (tool !== null && misc.world !== null) {
			player.tool.call('mouseup', [mouse, event]);
		}
	});

	window.addEventListener("mousemove", event => {
		var cancelledButtons = updateMouse(event, 'mousemove', event.pageX, event.pageY);
		var remainingButtons = mouse.buttons & ~cancelledButtons;
		if (remainingButtons & 0b100) { /* If middle click was not used for anything */
			moveCameraBy((mouse.mouseDownWorldX - mouse.worldX) / 16, (mouse.mouseDownWorldY - mouse.worldY) / 16);
		}
	});

	const mousewheel = event => {
		const nevt = normalizeWheel(event);
		if (player.tool !== null && misc.world !== null && player.tool.isEventDefined('scroll')) {
			if (player.tool.call('scroll', [mouse, nevt, event])) {
				return;
			}
		}
		if (event.ctrlKey) {
			camera.zoom += Math.max(-1, Math.min(1, -nevt.pixelY));
			//-nevt.spinY * camera.zoom / options.zoomLimitMax; // <- needs to be nicer
		} else {
			var delta = Math.max(-1, Math.min(1, nevt.spinY));
			var pIndex = player.paletteIndex;
			if (delta > 0) {
				pIndex++;
			} else if (delta < 0) {
				pIndex--;
			}
			player.paletteIndex = pIndex;
		}
	};

	var wheelEventName = ('onwheel' in document) ? 'wheel' : ('onmousewheel' in document) ? 'mousewheel' : 'DOMMouseScroll';

	viewport.addEventListener(wheelEventName, mousewheel, { passive: true });
	viewport.addEventListener(wheelEventName, e => {
		e.preventDefault();
		return false;
	}, { passive: false });

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

	elements.soundToggle.addEventListener('change', e => {
		options.enableSounds = !elements.soundToggle.checked;
	});
	options.enableSounds = !elements.soundToggle.checked;

	elements.hexToggle.addEventListener('change', e => {
		options.hexCoords = elements.hexToggle.checked;
	});
	options.hexCoords = elements.hexToggle.checked;

	// Some cool custom css
	console.log("%c" +
		" _ _ _         _   _    _____ ___    _____ _         _     \n" +
		"| | | |___ ___| |_| |  |     |  _|  |  _  |_|_ _ ___| |___ \n" +
		"| | | | . |  _| | . |  |  |  |  _|  |   __| |_'_| -_| |_ -|\n" +
		"|_____|___|_| |_|___|  |_____|_|    |__|  |_|_,_|___|_|___|",
		"font-size: 15px; font-weight: bold;"
	);
	console.log("%cWelcome to the developer console!", "font-size: 20px; font-weight: bold; color: #F0F;");

	//windowSys.addWindow(new OWOPDropDown());
	resolveProtocols();

	/* Calls other initialization functions */
	eventSys.emit(e.init);

	updateXYDisplay(0, 0);

	var worldName = decodeURIComponent(window.location.pathname);
	if (worldName[0] === '/') {
		worldName = worldName.slice(1);
	}

	misc.urlWorldName = worldName;
}

function connect() {
	const serverGetter = (serverList => {
		var defaults = [];
		var availableServers = [];
		for (var i = 0; i < serverList.length; i++) {
			if (serverList[i].default) {
				defaults.push(serverList[i]);
			}
			availableServers.push(serverList[i]);
		}
		var index = 0;
		return (next) => {
			if (next) {
				if (defaults.length) {
					defaults.shift();
				} else {
					++index;
				}
			}
			if (defaults.length) {
				var sv = defaults[0];
				availableServers.push(sv);
				return sv;
			}
			return availableServers[index % availableServers.length];
		};
	})(options.serverAddress);

	retryingConnect(serverGetter, misc.urlWorldName);

	elements.reconnectBtn.onclick = () => retryingConnect(serverGetter, misc.urlWorldName);

	misc.tickInterval = setInterval(tick, 1000 / options.tickSpeed);
	//delete window.localStorage;
}

eventSys.once(e.loaded, () => statusMsg(true, "Initializing..."));
eventSys.once(e.misc.loadingCaptcha, () => statusMsg(true, "Trying to load captcha..."));
eventSys.once(e.misc.logoMakeRoom, () => {
	statusMsg(false, null);
	logoMakeRoom();
});

eventSys.once(e.loaded, function() {
	init();
	if (misc.showEUCookieNag) {
		windowSys.addWindow(new UtilDialog('Cookie notice',
`This box alerts you that we're going to use cookies!
If you don't accept their usage, disable cookies and reload the page.`, false, () => {
			setCookie('nagAccepted', 'true');
			misc.showEUCookieNag = false;
			logoMakeRoom(false);
			connect();
		}));
	} else {
		connect();
	}
});

eventSys.on(e.net.maxCount, count => {
	misc.world.maxCount = count;
	updatePlayerCount();
});

eventSys.on(e.net.playerCount, count => {
	misc.playerCount = count;
	updatePlayerCount();
});

eventSys.on(e.net.donUntil, (ts, pmult) => {
	const updTimer = () => {
		const now = Date.now();

		const secs = Math.floor(Math.max(0, ts - now) / 1000);
		const mins = Math.floor(secs / 60);
		const hours = Math.floor(mins / 60);
		let tmer = (hours > 0 ? hours + ':' : '')
			+ ((mins % 60) < 10 ? '0' : '') + (mins % 60) + ':'
			+ ((secs % 60) < 10 ? '0' : '') + (secs % 60);
		elements.dInfoDisplay.setAttribute("data-tmo", tmer);

	};

	clearInterval(misc.donTimer);
	elements.dInfoDisplay.setAttribute("data-pm", ''+pmult);
	elements.dInfoDisplay.setAttribute("data-ts", ''+ts);
	updTimer();
	if (ts > Date.now()) {
		misc.donTimer = setInterval(updTimer, 1000);
	}
});

eventSys.on(e.net.chat, receiveMessage);
eventSys.on(e.net.devChat, receiveDevMessage);

eventSys.on(e.net.world.setId, id => {
	if (!misc.storageEnabled) {
		return;
	}

	function autoNick() {
		if (misc.localStorage.nick) {
			net.protocol.sendMessage("/nick " + misc.localStorage.nick);
		}
	}

	// Automatic login
	let desiredRank = misc.localStorage.adminlogin ? RANK.ADMIN : misc.localStorage.modlogin ? RANK.MODERATOR : net.protocol.worldName in misc.worldPasswords ? RANK.USER : RANK.NONE;
	if (desiredRank > RANK.NONE) {
		var mightBeMod = false;
		let onWrong = function () {
			console.log("WRONG");
			eventSys.removeListener(e.net.sec.rank, onCorrect);
			if (desiredRank == RANK.ADMIN) {
				delete misc.localStorage.adminlogin;
			} else if (desiredRank == RANK.MODERATOR) {
				delete misc.localStorage.modlogin;
			} else if (desiredRank == RANK.USER) {
				delete misc.worldPasswords[net.protocol.worldName];
				saveWorldPasswords();
			}
			retryingConnect(() => net.currentServer, net.protocol.worldName)
		};
		let onCorrect = function (newrank) {
			if (newrank == desiredRank || (mightBeMod && newrank == RANK.MODERATOR)) {
				setTimeout(() => {
					/* Ugly fix for wrong password on worlds without one */
					eventSys.removeListener(e.net.disconnected, onWrong);
				}, 1000);
				eventSys.removeListener(e.net.sec.rank, onCorrect);
				autoNick();
			}
		};
		eventSys.once(e.net.disconnected, onWrong);
		eventSys.on(e.net.sec.rank, onCorrect);
		var msg;
		if (desiredRank == RANK.ADMIN) {
			msg = "/adminlogin " + misc.localStorage.adminlogin;
		} else if (desiredRank == RANK.MODERATOR) {
			msg = "/modlogin " + misc.localStorage.modlogin;
		} else if (desiredRank == RANK.USER) {
			msg = "/pass " + misc.worldPasswords[net.protocol.worldName];
			mightBeMod = true;
		}
		net.protocol.sendMessage(msg);
	} else {
		autoNick();
	}
});

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
	showWorldUI(!options.noUi);
	renderer.showGrid(!options.noUi);
	sounds.play(sounds.launch);
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
	if (updateXYDisplay(mouse.tileX, mouse.tileY)) {
		updateClientFx();
	}
});

eventSys.on(e.camera.zoom, camera => {
	if (updateXYDisplay(mouse.tileX, mouse.tileY)) {
		updateClientFx();
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
	if (player.rank !== RANK.ADMIN) { /* TODO */
		if (misc.exceptionTimeout) {
			clearTimeout(misc.exceptionTimeout);
		}
		misc.exceptionTimeout = setTimeout(() => showDevChat(false), 5000);
	}
});

window.addEventListener("load", () => {
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
	elements.topRightDisplays = document.getElementById("topright-displays");
	elements.dInfoDisplay = document.getElementById("dinfo-display");

	elements.palette = document.getElementById("palette");
	elements.paletteColors = document.getElementById("palette-colors");
	elements.paletteCreate = document.getElementById("palette-create");
	elements.paletteInput = document.getElementById("palette-input");
	elements.paletteBg = document.getElementById("palette-bg");

	elements.animCanvas = document.getElementById("animations");

	elements.viewport = document.getElementById("viewport");
	elements.windows = document.getElementById("windows");

	elements.chatInput = document.getElementById("chat-input");

	elements.soundToggle = document.getElementById("no-sound");
	elements.hexToggle = document.getElementById("hex-coords");

	elements.helpButton = document.getElementById("help-button");

	var donateBtn = document.getElementById("donate-button");
	elements.helpButton.addEventListener("click", function () {
		document.getElementById("help").className = "";
		donateBtn.innerHTML = "";

		window.PayPal.Donation.Button({
			env:'production',
			hosted_button_id:'HLLU832GVG824',
			custom: 'g=owop&w=' + (misc.world ? encodeURIComponent(misc.world.name) : 'main') + '&i=' + (net.protocol ? net.protocol.id : 0),
			image: {
				src:donateBtn.getAttribute("data-isrc"),
				alt:'Donate with PayPal button',
				title:'PayPal - The safer, easier way to pay online!',
			}
		}).render('#donate-button');
	});

	document.getElementById("help-close").addEventListener("click", function () {
		document.getElementById("help").className = "hidden";
	});

	checkFunctionality(() => eventSys.emit(e.loaded));
});


/* Public API definitions */
PublicAPI.emit = eventSys.emit.bind(eventSys);
PublicAPI.on = eventSys.on.bind(eventSys);
PublicAPI.once = eventSys.once.bind(eventSys);
PublicAPI.removeListener = eventSys.removeListener.bind(eventSys);
PublicAPI.elements = elements;
PublicAPI.mouse = mouse;
PublicAPI.world = getNewWorldApi();
PublicAPI.chat = {
	send: (msg) => net.protocol && net.protocol.sendMessage(msg),
	clear: clearChat,
	local: receiveMessage,
	get onDevMsg() { return misc.devRecvReader; },
	set onDevMsg(fn) { misc.devRecvReader = fn; },
	get postFormatRecvModifier() { return misc.chatPostFormatRecvModifier; },
	set postFormatRecvModifier(fn) { misc.chatPostFormatRecvModifier = fn; },
	get recvModifier() { return misc.chatRecvModifier; },
	set recvModifier(fn) { misc.chatRecvModifier = fn; },
	get sendModifier() { return misc.chatSendModifier; },
	set sendModifier(fn) { misc.chatSendModifier = fn; }
};
PublicAPI.sounds = sounds;
PublicAPI.poke = () => {
	if (net.protocol) {
		net.protocol.lastSentX = Infinity;
	}
};
PublicAPI.muted = [];
