/*
 * TODO List: https://trello.com/b/v6F6isSv/worldofpixels
 * NOTE: Let's stick with the correct way of storing colors,
 * first byte should be red value: 0xAABBGGRR, or [r, g, b]
 */
'use strict';

import { DiscordSDK } from '@discord/embedded-app-sdk';

import { normalizeWheel } from './util/normalizeWheel.js';
import anchorme from './util/anchorme.js';

import { CHUNK_SIZE, EVENTS as e, RANK } from './conf.js';
import { Bucket } from './util/Bucket.js';
import { updateBindDisplay } from './tools.js';
import { escapeHTML, getTime, getCookie, setCookie, cookiesEnabled, storageEnabled, loadScript, eventOnce, initializeTooltips, KeyCode, KeyName } from './util/misc.js';

import { eventSys, PublicAPI, AnnoyingAPI as aa, wsTroll } from './global.js';
import { options } from './conf.js';
import { World } from './World.js';
import { camera, renderer, moveCameraBy } from './canvas_renderer.js';
import { net } from './networking.js';
import { updateClientFx, player } from './local_player.js';
import { resolveProtocols, definedProtos } from './protocol/all.js';
import { windowSys, GUIWindow, OWOPDropDown, UtilDialog } from './windowsys.js';
import { colorUtils } from './util/color.js';

import { createContextMenu } from './context.js';

import launchSoundUrl from '../audio/launch.mp3';
import placeSoundUrl from '../audio/place.mp3';
import clickSoundUrl from '../audio/click.mp3';

let auth;
const id = '1366130123597942795';
let sdk;

if (window.location.href.includes('discordsays.com')) {
	sdk = new DiscordSDK(id);
}

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
	devRecvReader: msg => { },
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
	donTimer: 0,
	keybinds: {},
	palettes: {},
	attemptedPassword: null
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

let plWidth = 0;
export var playerList = {};
export var playerListTable = document.createElement("table");
export var playerListWindow = new GUIWindow('Players', { closeable: true }, wdow => {
	var tableHeader = document.createElement("tr");
	tableHeader.innerHTML = "<th>Id</th><th>X</th><th>Y</th>";
	playerListTable.appendChild(tableHeader);
	wdow.container.appendChild(playerListTable);
	wdow.container.id = "player-list";
	plWidth = wdow.container.parentElement.offsetWidth;
})
playerListWindow.container.updateDisplay = function () {
	let diff = playerListWindow.container.parentElement.offsetWidth - plWidth
	if (diff !== 0) {
		playerListWindow.move(playerListWindow.x - diff, playerListWindow.y);
		plWidth = playerListWindow.container.parentElement.offsetWidth;
	}
}
function fixPlayerListPos() {
	playerListWindow.move(window.innerWidth - elements.paletteBg.getBoundingClientRect().width - playerListWindow.container.parentElement.offsetWidth - 16, elements.topRightDisplays.getBoundingClientRect().height + 16);
}
window.addEventListener("resize", fixPlayerListPos);

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

function receiveMessage(rawText) {
	rawText = misc.chatRecvModifier(rawText);
	if (!rawText) return;

	let addContext = (el, nick, id) => {
		el.addEventListener('click', function (event) {
			createContextMenu(event.clientX, event.clientY, [
				["Mute " + nick, function () {
					PublicAPI.muted.push(id);
					receiveMessage({
						sender: 'server',
						type: 'info',
						data: {
							allowHTML: true,
							message: "<span style=\"color: #ffa71f\">Muted " + id + "</span>"
						}
					});
				}]
			]);
			event.stopPropagation();
		});
	}

	let message = document.createElement('li');

	let parsedJson = JSON.parse(rawText);
	let text = parsedJson.data.message;
	let sender = parsedJson.sender;
	let type = parsedJson.type;
	let data = parsedJson.data;
	if (!data) return;

	// actions
	if (!!data.action) {
		switch (data.action) {
			case 'invalidatePassword': {
				if (!misc.storageEnabled) break;
				let passwordType = data.passwordType;
				switch (passwordType) {
					case 'adminlogin':
					case 'modlogin': {
						delete misc.localStorage[passwordType];
						misc.attemptedPassword = null;
						break;
					}
					case 'worldpass':
					default: {
						delete misc.worldPasswords[net.protocol.worldName];
						misc.attemptedPassword = null;
						break;
					}
				}
				saveWorldPasswords();
				net.protocol.ws.close();
				break;
			}
			case 'savePassword': {
				if (!misc.storageEnabled) break;
				let passwordType = data.passwordType;
				switch (passwordType) {
					case 'adminlogin':
					case 'modlogin': {
						misc.localStorage[passwordType] = misc.attemptedPassword;
						misc.attemptedPassword = null;
						break;
					}
					case 'worldpass':
					default: {
						misc.worldPasswords[net.protocol.worldName] = misc.attemptedPassword;
						misc.attemptedPassword = null;
						break;
					}
				}
				saveWorldPasswords();
				break;
			}
			case 'updateNick': {
				if (!misc.storageEnabled) break;
				if (data.nick !== undefined && data.nick !== null) misc.localStorage.nick = data.nick;
				else delete misc.localStorage.nick;
				break;
			}
		}
	}

	if (!text) return;

	let allowHTML = false;
	if (sender === 'server') {
		allowHTML = data.allowHTML || false;
		if (type === 'info') message.className = 'serverInfo';
		if (type === 'error') message.className = 'serverError';
		if (type === 'raw') {
			allowHTML = true; // assume HTML is allowed
			message.className = 'serverRaw';
		}
		if (type === 'whisperSent') {
			if (PublicAPI.muted.includes(data.senderID)) return;
			let nick = document.createElement("span");
			nick.className = 'whisper';
			nick.innerHTML = escapeHTML(`-> You tell ${data.targetID}: `);
			addContext(nick, data.nick, data.senderID);
			message.appendChild(nick);
		}
	}
	else if (sender === 'player') {
		if (type === 'whisperReceived') {
			let nick = document.createElement("span");
			nick.className = 'whisper';
			nick.innerHTML = escapeHTML(`-> ${data.senderID} tells you: `);
			message.appendChild(nick);
		}
		if (type === 'message') {
			if (PublicAPI.muted.includes(data.senderID) && data.rank < RANK.MODERATOR) return;
			let nick = document.createElement("span");
			nick.className = 'nick';
			message.style.display = 'block';
			if (data.rank >= RANK.ADMIN || data.allowHTML) allowHTML = true;

			if (data.rank === RANK.ADMIN) message.className = 'adminMessage';
			else if (data.rank === RANK.MODERATOR) message.className = 'modMessage';
			else if (data.rank === RANK.USER) message.className = 'userMessage';
			else message.className = 'playerMessage';

			if(data.nick.startsWith('[D]')) {
				message.className = 'discord';
				allowHTML = false;
				console.log("hi this should print if the gateway bot spoke");
			}

			if (!allowHTML) nick.innerHTML = escapeHTML(`${data.nick}: `);
			else nick.innerHTML = `${data.nick}: `;

			message.appendChild(nick);
			console.log(nick);
		}
	}

	let msg = misc.lastMessage ? misc.lastMessage.text : '';
	if (msg.endsWith('\n')) msg = msg.slice(0, -1);
	if (misc.lastMessage) console.log(misc.lastMessage.ignore);
	if (msg === text && misc.lastMessage && !misc.lastMessage.ignore) misc.lastMessage.incCount();
	else {
		var span = document.createElement("span");
		if (!allowHTML) text = escapeHTML(text).replace(/\&#x2F;/g, '/');
		misc.lastMessage = {
			get text() { return text; },
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
			},
			ignore: type === "whisperReceived"
		};
		let textByNls = text.split('\n');
		let firstNl = textByNls.shift();
		firstNl = firstNl.replace(/(?:&lt;|<)a:(.+?):([0-9]{8,32})(?:&gt;|>)/g, '<img class="emote" src="https://cdn.discordapp.com/emojis/$2.gif?v=1">'); // animated
		firstNl = firstNl.replace(/(?:&lt;|<):(.+?):([0-9]{8,32})(?:&gt;|>)/g, '<img class="emote" src="https://cdn.discordapp.com/emojis/$2.png?v=1">'); // static
		text = firstNl + '\n' + textByNls.join('\n');
		text = misc.chatPostFormatRecvModifier(text);
		span.innerHTML = anchorme(text, {
			attributes: [{
				name: 'target',
				value: '_blank'
			}]
		});
		message.appendChild(span);
		scrollChatToBottom(() => {
			elements.chatMessages.appendChild(message);
			let children = elements.chatMessages.children;
			if (children.length > options.maxChatBuffer) children[0].remove();
		}, true);
	}
}

// function oldReceiveMessage(text) {
// 	console.log(text);
// 	text = misc.chatRecvModifier(text);
// 	if (!text) {
// 		return;
// 	}

// 	var addContext = (elem, nickname, id) => {
// 		elem.addEventListener("click", function(event) {
// 			createContextMenu(event.clientX, event.clientY, [
// 				["Mute " + nickname, function() {
// 					PublicAPI.muted.push(id);
// 					receiveMessage({
// 						sender: 'server',
// 						type: 'info',
// 						data:{
// 							allowHTML: true,
// 							message: `"<span style=\"color: #ffa71f\">Muted " + id + "</span>"`
// 						}
// 					});
// 				}]
// 			]);
// 			event.stopPropagation();
// 		});
// 	};

// 	var message = document.createElement("li");
// 	var realText = text;
// 	var isAdmin = false;
// 	if (text.startsWith("[D]")) {
// 		message.className = "discord";
// 		var nick = document.createElement("span");
// 		nick.className = "nick";
// 		var nickname = text.split(": ")[0] + ": ";
// 		nick.innerHTML = escapeHTML(nickname);
// 		message.appendChild(nick);
// 		text = text.slice(nickname.length);
// 	} else if (text.startsWith("[Server]") || text.startsWith("Server:") || text.startsWith("Nickname set to") || text.startsWith("User: ")) {
// 		message.className = "server";
// 	} else if (text.startsWith("->")) {
// 		var cuttxt = text.slice(3);
// 		var id = parseInt(cuttxt);
// 		cuttxt = cuttxt.slice(id.toString().length);
// 		if (cuttxt.startsWith(" tells you: ")) {
// 			if (PublicAPI.muted.includes(id)) {
// 				return;
// 			}

// 			var nick = document.createElement("span");
// 			nick.className = "tell";
// 			nick.innerHTML = escapeHTML(`-> ${id} tells you: `);
// 			addContext(nick, id, id);
// 			message.appendChild(nick);
// 			text = cuttxt.slice(12);
// 		} else {
// 			message.className = "tell";
// 		}
// 	} else if (text.startsWith("(M)")) {
// 		message.className = "moderator";
// 	} else if (isNaN(text.split(": ")[0]) && text.split(": ")[0].charAt(0) != "[") {
// 		message.className = "admin";
// 		isAdmin = true;
// 	} else {
// 		var nick = document.createElement("span");
// 		nick.className = "nick";
// 		var nickname = text.split(": ")[0];
// 		var id = nickname.startsWith("[") ? nickname.split(" ")[0].slice(1, -1) : nickname;
// 		id = parseInt(id);
// 		if (PublicAPI.muted.includes(id)) {
// 			return;
// 		}
// 		nick.innerHTML = escapeHTML(nickname + ": ");
// 		nick.addEventListener("click", function(event) {
// 			createContextMenu(event.clientX, event.clientY, [
// 				["Mute " + nickname, function() {
// 					PublicAPI.muted.push(id);
// 					receiveMessage({
// 						sender: 'server',
// 						type: 'info',
// 						data:{
// 							allowHTML: true,
// 							message: "<span style=\"color: #ffa71f\">Muted " + id + "</span>"
// 						}
// 					});
// 				}]
// 			]);
// 			event.stopPropagation();
// 		});
// 		message.appendChild(nick);
// 		text = text.slice(nickname.length + 2);
// 	}
// 	var idIndex = text.indexOf(': '); /* This shouldn't be like this, change on proto switch */
// 	if (idIndex !== -1) {
// 		var ntext = text.substr(0, idIndex);
// 		realText = ntext.replace(/\d+/g, '') + text.slice(idIndex + 2);
// 	}

// 	if (misc.lastMessage && misc.lastMessage.text === realText) {
// 		misc.lastMessage.incCount();
// 	} else {
// 		var span = document.createElement("span");
// 		misc.lastMessage = {
// 			get text() { return realText; },
// 			incCount: () => {
// 				var times = span.recvTimes || 1;
// 				span.innerHTML = `${anchorme(text, {
// 					attributes: [
// 						{
// 							name: "target",
// 							value: "_blank"
// 						}
// 					]
// 				})} [x${++times}]`;
// 				span.recvTimes = times;
// 				message.style.animation = 'none'; /* Reset fading anim */
// 				message.offsetHeight; /* Reflow */
// 				message.style.animation = null;
// 			}
// 		};
// 		if (!isAdmin) {
// 			text = escapeHTML(text).replace(/\&\#x2F;/g, "/");
// 		}
// 		var textByNls = text.split('\n');
// 		var firstNl = textByNls.shift();
// 		firstNl = firstNl.replace(/(?:&lt;|<)a:(.+?):([0-9]{8,32})(?:&gt;|>)/g, '<img class="emote" src="https://cdn.discordapp.com/emojis/$2.gif?v=1">'); // animated
// 		firstNl = firstNl.replace(/(?:&lt;|<):(.+?):([0-9]{8,32})(?:&gt;|>)/g,  '<img class="emote" src="https://cdn.discordapp.com/emojis/$2.png?v=1">'); // static
// 		text = firstNl + '\n' + textByNls.join('\n');
// 		text = misc.chatPostFormatRecvModifier(text);
// 		span.innerHTML = anchorme(text, {
// 			attributes: [
// 				{
// 					name: "target",
// 					value: "_blank"
// 				}
// 			]
// 		});
// 		message.appendChild(span);
// 		scrollChatToBottom(() => {
// 			elements.chatMessages.appendChild(message);
// 			var childs = elements.chatMessages.children;
// 			if (childs.length > options.maxChatBuffer) {
// 				childs[0].remove();
// 			}
// 		}, true);
// 	}
// }

function receiveDevMessage(text) {
	try {
		misc.devRecvReader(text);
	} catch (e) { }
	var message = document.createElement("li");
	var span = document.createElement("span");
	span.innerHTML = text;
	message.appendChild(span);
	elements.devChatMessages.appendChild(message);
	elements.devChatMessages.scrollTop = elements.devChatMessages.scrollHeight;
}

function scrollChatToBottom(callback, dontScrollIfNotTop = false) {
	var shouldScroll = !dontScrollIfNotTop || elements.chatMessages.scrollHeight - elements.chatMessages.scrollTop - elements.chatMessages.clientHeight <= 0.1;
	console.log(shouldScroll);
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
		updateMouse({}, 'mousemove', mouse.x, mouse.y);
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

PublicAPI.net = net;

function showPlayerList(bool) {
	if (bool) {
		windowSys.addWindow(playerListWindow);
		plWidth = playerListWindow.container.parentElement.offsetWidth;
		fixPlayerListPos();
	} else {
		windowSys.delWindow(playerListWindow);
	}
}

function updateXYDisplay(x, y) {
	if (misc.lastXYDisplay[0] !== x || misc.lastXYDisplay[1] !== y) {
		misc.lastXYDisplay = [x, y];
		if (!options.hexCoords) {
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

function dismissNotice() {
	misc.localStorage.dismissedId = elements.noticeDisplay.noticeId;
	elements.noticeDisplay.style.transform = "translateY(-100%)";
	elements.noticeDisplay.style.pointerEvents = "none";
	setTimeout(() => elements.noticeDisplay.style.display = "none", 750);
}

function showWorldUI(bool) {
	misc.guiShown = bool;
	elements.xyDisplay.style.transform = bool ? "initial" : "";
	elements.pBucketDisplay.style.transform = bool ? "initial" : "";
	elements.playerCountDisplay.style.transform = bool ? "initial" : "";
	elements.palette.style.transform = bool ? "translateY(-50%)" : "";
	elements.chat.style.transform = bool ? "initial" : "";
	elements.chatInput.disabled = !bool;
	// for(let element of elements.topLeftDisplays.children) element.style.transform = bool ? "initial" : "";
	// for(let element of elements.topRightDisplays.children) element.style.transform = bool ? "initial" : "";
	elements.chatInput.style.display = "initial";
	// elements.paletteBg.style.visibility = bool ? "" : "hidden";
	// elements.helpButton.style.visibility = bool ? "" : "hidden";
	elements.topRightDisplays.classList[bool ? 'remove' : 'add']('hideui');
	elements.topLeftDisplays.classList[bool ? 'remove' : 'add']('hideui');
	elements.helpButton.style.transform = bool ? "" : "translateY(120%) translateX(-120%)";
	elements.paletteBg.style.transform = bool ? "" : "translateX(100%)";
	elements.noticeDisplay.style.transform = bool ? 'inherit' : `translateY(-${elements.topLeftDisplays.getBoundingClientRect().height}px)`;
	elements.pBucketDisplay.textContent = `Place bucket: ${net.protocol.placeBucket.allowance.toFixed(1)} (${net.protocol.placeBucket.rate}/${net.protocol.placeBucket.time}s).`;
	// elements.paletteBg.classList[bool ? 'remove' : 'add']('hideui');
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

function toggleMuteSounds() {
	options.enableSounds = !elements.soundToggle.checked;
	eventSys.emit(e.net.chat, options.enableSounds ? "Sounds enabled" : "Sounds disabled");
}

let activeKeybindListener = null;
let currentKeybindName = null;

export function getNewBind(tname, self) {
	const hc = document.getElementById('help-close');
	const kbd = document.getElementById('keybind-settings');

	const endBind = () => {
		document.removeEventListener("keydown", listener);
		hc.removeEventListener("click", endBind);
		kbd.removeEventListener('click', oncancel);
		activeKeybindListener = null;
		currentKeybindName = null;
		self.textContent = "rebind";
	}

	if (activeKeybindListener) endBind();

	currentKeybindName = tname;

	const oncancel = (e) => {
		if (e.target !== self && e.target.tagName === 'BUTTON') endBind();
	}

	const listener = (event) => {
		event.stopPropagation();
		let code = event.which || event.keyCode;

		if (code == KeyCode.ESCAPE) return endBind();

		// prevent binding to hard-coded keybinds
		if ([KeyCode.SHIFT, KeyCode.BACKTICK, KeyCode.TILDE, KeyCode.G, KeyCode.H, KeyCode.F1, KeyCode.F2, KeyCode.PLUS,
		KeyCode.NUMPAD_ADD, KeyCode.SUBTRACT, KeyCode.NUMPAD_SUBTRACT, KeyCode.EQUALS, KeyCode.UNDERSCORE].includes(code)) {
			const textElements = document.querySelectorAll('[class^="kb-"]');
			for (const el of textElements) {
				if (el.classList[0].includes(KeyName[code])) {
					el.style.color = '#f00';
					setTimeout(() => {
						el.style.transition = 'color 0.3s ease-in-out';
						el.style.color = '';
						setTimeout(() => {
							el.style.transition = '';
						}, 300);
					}, 100);
					break;
				}
			}
			return endBind();
		}
		if (code == KeyCode.DELETE) {
			delete misc.keybinds[tname];
			console.log("deleted keybind");
		} else {
			misc.keybinds[tname] = code;
			console.log(`added keybind for ${tname}: ${KeyName[code]} (${code})`);
		}
		endBind();
		updateBindDisplay();
		saveKeybinds();
	}

	activeKeybindListener = listener;
	document.addEventListener("keydown", listener);
	hc.addEventListener("click", endBind);
	kbd.addEventListener('click', oncancel);

	self.textContent = "Listening for input... Press ESC or click again to cancel.";
};

function saveKeybinds() {
	if (misc.storageEnabled) {
		misc.localStorage.keybinds = JSON.stringify(misc.keybinds);
	};
};

function loadDefaultBindings(name) {
	switch (name) {
		case "new":
			misc.keybinds = { //probably sane defaults
				"cursor": KeyCode.B,
				"move": KeyCode.V,
				"pipette": KeyCode.Q,
				"eraser": KeyCode.S,
				"zoom": KeyCode.A,
				"export": KeyCode.E,
				"fill": KeyCode.F,
				"line": KeyCode.W,
				"protect": KeyCode.D,
				"area protect": KeyCode.R,
				"paste": KeyCode.X,
				"copy": KeyCode.C
			};
			updateBindDisplay();
			saveKeybinds();
			break;
		case "og":
		default:
			misc.keybinds = { //probably sane defaults
				"cursor": KeyCode.O,
				"move": KeyCode.M,
				"pipette": KeyCode.P,
				"eraser": KeyCode.C,
				"zoom": KeyCode.Z,
				"export": KeyCode.E,
				"fill": KeyCode.F,
				"line": KeyCode.L,
				"protect": KeyCode.P,
				"area protect": KeyCode.A,
				"paste": KeyCode.W,
				"copy": KeyCode.Q
			};
			updateBindDisplay();
			saveKeybinds();
			break;
	}
}

function init() {
	var viewport = elements.viewport;
	var chatinput = elements.chatInput;
	initializeTooltips();
	if (misc.storageEnabled) {
		if (misc.localStorage.worldPasswords) {
			try {
				misc.worldPasswords = JSON.parse(misc.localStorage.worldPasswords);
			} catch (e) { }
		}
		if (misc.localStorage.keybinds) {
			try {
				misc.keybinds = JSON.parse(misc.localStorage.keybinds);
			} catch (e) { };
		} else {
			loadDefaultBindings("og"); // just to please the masses, original defaults are the default
			console.log("No keybinds found, using original defaults");
		}
		if (misc.localStorage.palettes) {
			try {
				misc.palettes = JSON.parse(misc.localStorage.palettes);
			} catch (e) { };
		}
	}
	updateBindDisplay();

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
			case KeyCode.ESCAPE:
				closeChat();
				break;
			case KeyCode.ENTER:
				if (!event.shiftKey) {
					event.preventDefault();
					var text = chatinput.value;
					historyIndex = 0;
					chatHistory.unshift(text);
					if (misc.storageEnabled) {
						if (text.startsWith("/adminlogin ") || text.startsWith("/modlogin ") || text.startsWith("/pass "))
							misc.attemptedPassword = text.split(' ').slice(1).join(' ');
					}
					// if (misc.storageEnabled) {
					// 	if (text.startsWith("/adminlogin ")) {
					// 		misc.localStorage.adminlogin = text.slice(12);
					// 	} else if (text.startsWith("/modlogin ")) {
					// 		misc.localStorage.modlogin = text.slice(10);
					// 	} else if (text.startsWith("/nick")) {
					// 		var nick = text.slice(6);
					// 		if (nick.length) {
					// 			misc.localStorage.nick = nick;
					// 		} else {
					// 			delete misc.localStorage.nick;
					// 		}
					// 	} else if (text.startsWith("/pass ") && misc.world) {
					// 		var pass = text.slice(6);
					// 		misc.worldPasswords[net.protocol.worldName] = pass;
					// 		saveWorldPasswords();
					// 	}
					// }
					if (!event.ctrlKey) {
						text = misc.chatSendModifier(text);
					}
					net.protocol.sendMessage(text);
					chatinput.value = '';
					chatinput.style.height = "16px";
					event.stopPropagation();
				}
				break;
			case KeyCode.ARROW_UP:
				if (event.shiftKey && historyIndex < chatHistory.length - 1) {
					historyIndex++;
					chatinput.value = chatHistory[historyIndex];
					chatinput.style.height = 0;
					chatinput.style.height = Math.min(chatinput.scrollHeight - 8, 16 * 4) + "px";
				}
				break;
			case KeyCode.ARROW_DOWN:
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

			for (let tname in misc.keybinds) {
				if (misc.keybinds[tname] == event.keyCode) {
					player.tool = tname;
				}
			};

			switch (keyCode) {
				/*case KeyCode.Q:
					player.tool = "pipette";
					break;

				case KeyCode.D:
					player.tool = "cursor";
					break;

				case KeyCode.X:
				case KeyCode.SHIFT:
					player.tool = "move";
					break;

				case KeyCode.F:
					player.tool = "fill";
					break;

				case KeyCode.W:
					player.tool = "line";
					break;

				case KeyCode.E:
					player.tool = "export";
					break;

				case KeyCode.A:
					player.tool = "eraser";
					break;

				case KeyCode.ONE:
					player.tool = "paste";
					break;

				case KeyCode.TWO:
					player.tool = "copy";
					break;

				case KeyCode.THREE:
					player.tool = "protect";
					break;

				case KeyCode.R:
					player.tool = "area protect";
					break;*/

				case KeyCode.SHIFT:
					player.tool = "move";
					break; //added back here because of the weird little temp move thing

				case KeyCode.Z:
					if (!misc.world || !event.ctrlKey) break;
					misc.world.undo(event.shiftKey);
					event.preventDefault();
					break;

				case KeyCode.BACKTICK:
				case KeyCode.TILDE:
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

				case KeyCode.G:
					renderer.showGrid(!renderer.gridShown);
					break;

				case KeyCode.H:
					options.showProtectionOutlines = !options.showProtectionOutlines;
					renderer.render(renderer.rendertype.FX);
					break;

				/*case KeyCode.M:
					elements.soundToggle.checked = !elements.soundToggle.checked;
					toggleMuteSounds();
					break;
				*/
				case KeyCode.F1:
					showWorldUI(!misc.guiShown);
					event.preventDefault();
					break;

				case KeyCode.F2:
					options.showPlayers = !options.showPlayers;
					renderer.render(renderer.rendertype.FX);
					break;

				case KeyCode.PLUS:
				case KeyCode.NUMPAD_ADD:
					++camera.zoom;
					break;

				case KeyCode.MINUS:
				case KeyCode.NUMPAD_SUBTRACT:
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
			if (keyCode == KeyCode.ENTER) {
				elements.chatInput.focus();
			} else if (keyCode == KeyCode.SHIFT) {
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
		toggleMuteSounds();
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
		"font-size: 10px; font-weight: bold;"
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

eventSys.once(e.loaded, function () {
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
	elements.dInfoDisplay.setAttribute("data-pm", '' + pmult);
	elements.dInfoDisplay.setAttribute("data-ts", '' + ts);
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
		if (auth) {
			net.protocol.sendMessage(`/nick ${auth.user.global_name ? auth.user.global_name : auth.user.username}`);
		}
		else if (misc.localStorage.nick) {
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
			// if (desiredRank == RANK.ADMIN) {
			// 	delete misc.localStorage.adminlogin;
			// } else if (desiredRank == RANK.MODERATOR) {
			// 	delete misc.localStorage.modlogin;
			// } else if (desiredRank == RANK.USER) {
			// 	delete misc.worldPasswords[net.protocol.worldName];
			// 	saveWorldPasswords();
			// }
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
			misc.attemptedPassword = misc.localStorage.adminlogin;
			msg = "/adminlogin " + misc.attemptedPassword;
		} else if (desiredRank == RANK.MODERATOR) {
			misc.attemptedPassword = misc.localStorage.modlogin;
			msg = "/modlogin " + misc.localStorage.modlogin;
		} else if (desiredRank == RANK.USER) {
			misc.attemptedPassword = misc.worldPasswords[net.protocol.worldName];
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

	elements.noticeDisplay = document.getElementById("notice-display");
	elements.noticeDisplay.noticeId = elements.noticeDisplay.getAttribute("notice-id") || 1;
	if (misc.localStorage.dismissedId != elements.noticeDisplay.noticeId) elements.noticeDisplay.addEventListener("click", dismissNotice);
	else elements.noticeDisplay.style.display = "none";

	elements.xyDisplay = document.getElementById("xy-display");
	elements.pBucketDisplay = document.getElementById("pbucket-display");
	elements.devChat = document.getElementById("dev-chat");
	elements.chat = document.getElementById("chat");
	elements.devChatMessages = document.getElementById("dev-chat-messages");
	elements.chatMessages = document.getElementById("chat-messages");
	elements.playerCountDisplay = document.getElementById("playercount-display");
	elements.topLeftDisplays = document.getElementById("topleft-displays");
	elements.topRightDisplays = document.getElementById("topright-displays");
	elements.dInfoDisplay = document.getElementById("dinfo-display");

	elements.palette = document.getElementById("palette");
	elements.paletteColors = document.getElementById("palette-colors");
	elements.paletteCreate = document.getElementById("palette-create");

	elements.pickerAnchor = document.getElementById('picker-anchor');

	elements.paletteLoad = document.getElementById("palette-load");
	elements.paletteSave = document.getElementById("palette-save");
	elements.paletteOpts = document.getElementById("palette-opts");
	elements.paletteBg = document.getElementById("palette-bg");

	elements.animCanvas = document.getElementById("animations");

	elements.viewport = document.getElementById("viewport");
	elements.windows = document.getElementById("windows");

	elements.chatInput = document.getElementById("chat-input");

	elements.keybindSelection = document.getElementById("keybinddiv");
	elements.soundToggle = document.getElementById("no-sound");
	elements.hexToggle = document.getElementById("hex-coords");

	elements.helpButton = document.getElementById("help-button");

	document.getElementById("kb-og").addEventListener("click", () => loadDefaultBindings("og"));
	document.getElementById("kb-new").addEventListener("click", () => loadDefaultBindings("new"));

	var donateBtn = document.getElementById("donate-button");
	elements.helpButton.addEventListener("click", function () {
		document.getElementById("help").className = "";
		donateBtn.innerHTML = "";

		window.PayPal.Donation.Button({
			env: 'production',
			hosted_button_id: 'HLLU832GVG824',
			custom: 'g=owop&w=' + (misc.world ? encodeURIComponent(misc.world.name) : 'main') + '&i=' + (net.protocol ? net.protocol.id : 0),
			image: {
				src: donateBtn.getAttribute("data-isrc"),
				alt: 'Donate with PayPal button',
				title: 'PayPal - The safer, easier way to pay online!',
			}
		}).render('#donate-button');
	});

	document.getElementById("help-close").addEventListener("click", function () {
		document.getElementById("help").className = "hidden";
	});

	elements.paletteSave.addEventListener('click', () => {
		windowSys.addWindow(new GUIWindow('save palette', { centerOnce: true, closeable: true }, (t) => {
			let top = document.createElement('div');
			let btm = document.createElement('div');
			let label = document.createElement('text');
			let input = document.createElement('input');
			let savebtn = document.createElement('button');
			label.innerHTML = 'palette name';
			label.className = 'whitetext';
			input.type = 'text';
			savebtn.innerHTML = 'save';
			function submit(){
				if(!input.value||input.value.length<1) return;
				if (!!misc.palettes[input.value]) {
					windowSys.addWindow(new GUIWindow('overwrite palette', { centered: true, closeable: false }, (w) => {
						w.container.classList.add('whitetext');
						const warning = document.createElement('div');
						warning.innerText = 'This palette already exists. Overwrite?';
						const yes = document.createElement('button');
						const no = document.createElement('button');
						yes.addEventListener('click', () => {
							misc.palettes[input.value] = player.palette.map(c => [...c]);
							savePalettes();
							w.close();
							t.close();
							const p = windowSys.getWindow('load palette');
							if (p) if (p.regen) p.regen();
						});
						no.addEventListener('click', () => {
							w.close();
						});
						yes.innerText = 'Yes';
						no.innerText = 'No';
						const btm = document.createElement('div');
						btm.style.display = 'flex';
						btm.style.flexDirection = 'row';
						btm.style.alignItems = 'center';
						btm.style.justifyContent = 'center';
						btm.appendChild(yes);
						btm.appendChild(no);
						w.container.appendChild(warning);
						w.container.appendChild(btm);
					}));
					return;
				}
				misc.palettes[input.value] = player.palette.map(c => [...c]);
				savePalettes();
				const w = windowSys.getWindow('load palette');
				if (w) if (w.regen) w.regen();
				t.close();
			}
			savebtn.addEventListener('click', () => submit());
			input.addEventListener('keydown', (e)=>{
				e.stopPropagation();
				let code = e.which || e.keyCode;
				if (code == KeyCode.ENTER) submit();
			});
			top.appendChild(label);
			btm.appendChild(input);
			btm.appendChild(savebtn);
			t.container.appendChild(top);
			t.container.appendChild(btm);
		}));
	});

	elements.paletteLoad.addEventListener('click', () => {
		//layout: split into two rows, top larger than bottom, top half has list of palettes, 3 columns per row, bottom half is split into two rows, top row has name of palette selected, bottom has load and delete options
		let selectedPalette = null;
		windowSys.addWindow(new GUIWindow('load palette', { centerOnce: true, closeable: true }, (t) => {
			let top = document.createElement('div');
			let paletteContainer = document.createElement('div');
			let btm = document.createElement('div');
			let selectionContainer = document.createElement('div');
			let preview = document.createElement('div');
			let label = document.createElement('text');
			let btnContainer = document.createElement('div');
			let loadbtn = document.createElement('button');
			let deletebtn = document.createElement('button');
			let clearbtn = document.createElement('button');
			let resetbtn = document.createElement('button');
			let pcanvas = document.createElement('canvas');
			let ctx = pcanvas.getContext('2d');

			t.container.appendChild(top);
			t.container.appendChild(btm);
			t.container.classList.add('whitetext');
			t.container.classList.add('palette-load');
			top.appendChild(paletteContainer);
			paletteContainer.classList.add('palette-load-palette-container');
			top.classList.add('palette-load-top');
			btm.appendChild(selectionContainer);
			btm.classList.add('palette-load-bottom');
			btm.appendChild(btnContainer);
			selectionContainer.appendChild(label);
			selectionContainer.appendChild(preview);
			preview.appendChild(pcanvas);
			selectionContainer.classList.add('palette-load-selection-container');
			btnContainer.appendChild(loadbtn);
			btnContainer.appendChild(deletebtn);
			btnContainer.appendChild(clearbtn);
			btnContainer.appendChild(resetbtn);
			btnContainer.classList.add('palette-load-button-contianer');
			loadbtn.innerText = 'load';
			deletebtn.innerText = 'delete';
			clearbtn.innerText = 'clear';
			resetbtn.innerText = 'reset';

			function createRow() {
				let row = document.createElement('div');
				row.classList.add('palette-button-row');
				return row;
			}

			function genRows() {
				paletteContainer.innerHTML = '';
				let currentRow = createRow();
				paletteContainer.appendChild(currentRow);
				const measure = document.createElement('div');
				measure.style.visibility = 'hidden';
				measure.style.position = 'absolute';
				measure.style.left = '-999999999px';
				document.body.appendChild(measure);
				let rw = 0;
				const mw = 400;

				for (let paletteName of Object.keys(misc.palettes)) {
					console.log(paletteName);
					let palette = document.createElement('button');
					palette.innerText = paletteName;

					measure.appendChild(palette);
					const bw = palette.offsetWidth + 4;
					measure.removeChild(palette);

					if (rw + bw > mw) {
						currentRow = createRow();
						paletteContainer.appendChild(currentRow);
						rw = 0;
					}

					currentRow.appendChild(palette);
					rw += bw;

					palette.addEventListener('click', () => {
						selectedPalette = paletteName;
						updateSelection();
					});
				}
				measure.remove();
				windowSys.centerWindow(t);
			}

			loadbtn.addEventListener('click', () => {
				if (!selectedPalette) return;
				player.clearPalette();
				player.palette = misc.palettes[selectedPalette];
				player.paletteIndex = 0;
				t.close();
			});

			deletebtn.addEventListener('click', () => {
				if (!selectedPalette) return;
				windowSys.addWindow(new GUIWindow('delete palette', { centered: true, closeable: false }, (w) => {
					w.container.classList.add('whitetext');
					w.container.style.textAlign = 'center';
					const warning = document.createElement('div');
					warning.innerText = 'Are you sure?';
					const yes = document.createElement('button');
					const no = document.createElement('button');
					yes.addEventListener('click', () => {
						delete misc.palettes[selectedPalette];
						savePalettes();
						selectedPalette = null;
						updateSelection();
						w.close();
						t.regen();
					});
					no.addEventListener('click', () => {
						w.close();
					});
					yes.innerText = 'Yes';
					no.innerText = 'No';
					const btm = document.createElement('div');
					btm.style.display = 'flex';
					btm.style.flexDirection = 'row';
					btm.style.alignItems = 'center';
					btm.style.justifyContent = 'center';
					btm.appendChild(yes);
					btm.appendChild(no);
					w.container.appendChild(warning);
					w.container.appendChild(btm);
				}));
			});

			clearbtn.addEventListener('click', () => {
				windowSys.addWindow(new GUIWindow('clear palette', { centered: true, closeable: false }, (w) => {
					w.container.classList.add('whitetext');
					const warning = document.createElement('div');
					warning.innerText = 'Do you want to clear your current palette?';
					const yes = document.createElement('button');
					const no = document.createElement('button');
					yes.addEventListener('click', () => {
						player.clearPalette();
						player.palette = [[0, 0, 0]];
						player.paletteIndex = 0;
						w.close();
					});
					no.addEventListener('click', () => {
						w.close();
					});
					yes.innerText = 'Yes';
					no.innerText = 'No';
					const btm = document.createElement('div');
					btm.style.display = 'flex';
					btm.style.flexDirection = 'row';
					btm.style.alignItems = 'center';
					btm.style.justifyContent = 'center';
					btm.appendChild(yes);
					btm.appendChild(no);
					w.container.appendChild(warning);
					w.container.appendChild(btm);
				}));
			});

			resetbtn.addEventListener('click', () => {
				windowSys.addWindow(new GUIWindow('reset palettes', { centered: true, closeable: false }, (w) => {
					w.container.classList.add('whitetext');
					w.container.style.textAlign = 'center';
					const warning = document.createElement('div');
					warning.innerText = 'Are you sure you want to erase all palettes?';
					const yes = document.createElement('button');
					const no = document.createElement('button');
					yes.addEventListener('click', () => {
						misc.palettes = {};
						savePalettes();
						selectedPalette = null;
						updateSelection();
						w.close();
						t.regen();
					});
					no.addEventListener('click', () => {
						w.close();
					});
					yes.innerText = 'Yes';
					no.innerText = 'No';
					const btm = document.createElement('div');
					btm.style.display = 'flex';
					btm.style.flexDirection = 'row';
					btm.style.alignItems = 'center';
					btm.style.justifyContent = 'center';
					btm.appendChild(yes);
					btm.appendChild(no);
					w.container.appendChild(warning);
					w.container.appendChild(btm);
				}));
			});

			function updateSelection() {
				if (!selectedPalette) {
					label.innerText = 'No palette selected';
					preview.style.display = 'none';
					// btnContainer.style.display = 'none';
					loadbtn.style.display = 'none';
					deletebtn.style.display = 'none';
					windowSys.centerWindow(t);
					return;
				}
				label.innerText = `Selected palette: ${selectedPalette}`;
				preview.style.display = '';
				loadbtn.style.display = '';
				deletebtn.style.display = '';
				const total = misc.palettes[selectedPalette].length;
				let pxIndex = 0;
				let pyIndex = 0;
				pcanvas.width = 448;
				pcanvas.height = 224;
				let tilesize = 16;
				while (Math.floor(pcanvas.width / tilesize) * Math.floor(pcanvas.height / tilesize) < total && tilesize > 1 && tilesize > 1) tilesize /= 2;
				// ctx.fillStyle = '#000';
				// ctx.fillRect(0, 0, pcanvas.width, pcanvas.height);
				for (let color of misc.palettes[selectedPalette]) {
					ctx.fillStyle = colorUtils.toHTML(colorUtils.u24_888(color[0], color[1], color[2]));
					ctx.fillRect(pxIndex * tilesize, pyIndex * tilesize, tilesize, tilesize);
					pxIndex++;
					if (pxIndex * tilesize >= pcanvas.width) {
						pxIndex = 0;
						pyIndex++;
					}
				}
				windowSys.centerWindow(t);
			}
			genRows();
			updateSelection();
			t.regen = () => genRows();
		}));
	});

	checkFunctionality(() => sdk ? initSdk() : eventSys.emit(e.loaded));

	setInterval(() => {
		let pb = net.protocol?.placeBucket;
		pb?.update();
		elements.pBucketDisplay.textContent = `Place bucket: ${pb?.allowance?.toFixed(1)} (${pb?.rate}/${pb?.time}s).`;
	}, 100);
});

// palettes: {paletteName:[[r,g,b],[r,g,b],...]} (alpha exists, but is ignored since rn everything is just fully opaque lol)

function savePalettes() {
	if (misc.storageEnabled) {
		misc.localStorage.palettes = JSON.stringify(misc.palettes);
	};
};

async function initSdk() {
	statusMsg(true, "Awaiting authorization...");
	await sdk.ready();

	const { code } = await sdk.commands.authorize({
		client_id: id,
		response_type: "code",
		state: "",
		prompt: "none",
		scope: [
			"identify",
			"guilds",
			"applications.commands",
			"rpc.activities.write",
		],
	});

	statusMsg(true, "Getting token...");

	// needs to be set up so that https://ourworldofpixels.com/oauth handles this properly
	const response = await fetch(`https://${id}.discordsays.com/.proxy/oauth`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			code
		}),
	});

	console.log(response);

	const { access_token } = await response.json();

	statusMsg(true, "Authenticating...");

	try {
		auth = await sdk.commands.authenticate({ access_token });
		statusMsg(false, "Finished!");
	} catch (e) {
		console.error("auth failed: ", JSON.stringify(e));
	}
	eventSys.emit(e.loaded);
}

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

PublicAPI.misc = misc;
PublicAPI.showDevChat = showDevChat;
PublicAPI.showPlayerList = showPlayerList;
PublicAPI.statusMsg = statusMsg;
PublicAPI.receiveDevMessage = receiveDevMessage;

PublicAPI.Bucket = Bucket;

PublicAPI.definedProtos = definedProtos;

PublicAPI.normalizeWheel = normalizeWheel;

PublicAPI.context = {
	createContextMenu: createContextMenu
};

window.addEventListener("mousemove", (e) => {
	window.clientX = e.clientX;
	window.clientY = e.clientY;
});