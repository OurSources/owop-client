'use strict';
import { eventSys, PublicAPI } from './global.js';
import { EVENTS as e, RANK } from './conf.js';
import { absMod, setTooltip } from './util/misc.js';
import { elements, mouse, misc, showDevChat, showPlayerList, revealSecrets } from './main.js';
import { colorUtils as color } from './util/color.js';
import { renderer } from './canvas_renderer.js';
import { cursors } from './tool_renderer.js';
import { tools, toolsApi, updateToolbar, updateToolWindow } from './tools.js';
import { Fx, PLAYERFX } from './Fx.js';
import { net } from './networking.js';
import { Bucket } from './util/Bucket.js';

export { updateClientFx };

let toolSelected = null;

// SWEETIE 16 palette
/*const palette = [
	[0x1A, 0x1C, 0x2C], [0x57, 0x29, 0x56], [0xB1, 0x41, 0x56], [0xEE, 0x7B, 0x58],
	[0xFF, 0xD0, 0x79], [0xA0, 0xF0, 0x72], [0x38, 0xB8, 0x6E], [0x27, 0x6E, 0x7B],
	[0x29, 0x36, 0x6F], [0x40, 0x5B, 0xD0], [0x4F, 0xA4, 0xF7], [0x86, 0xEC, 0xF8],
	[0xF4, 0xF4, 0xF4], [0x93, 0xB6, 0xC1], [0x55, 0x71, 0x85], [0x32, 0x40, 0x56]
];*/
// ENDESGA 16 palette
const palette = [
	[0xE4, 0xA6, 0x72], [0xB8, 0x6F, 0x50], [0x74, 0x3F, 0x39], [0x3F, 0x28, 0x32],
	[0x9E, 0x28, 0x35], [0xE5, 0x3B, 0x44], [0xFB, 0x92, 0x2B], [0xFF, 0xE7, 0x62],
	[0x63, 0xC6, 0x4D], [0x32, 0x73, 0x45], [0x19, 0x3D, 0x3F], [0x4F, 0x67, 0x81],
	[0xAF, 0xBF, 0xD2], [0xFF, 0xFF, 0xFF], [0x2C, 0xE8, 0xF4], [0x04, 0x84, 0xD1]
];
let paletteIndex = 0;

export const undoHistory = [];

const clientFx = new Fx(PLAYERFX.NONE, {
	isLocalPlayer: true,
	player: {
		get tileX() { return mouse.tileX; },
		get tileY() { return mouse.tileY; },
		get x() { return mouse.worldX; },
		get y() { return mouse.worldY; },
		get htmlRgb() {
			return player.htmlRgb;
		},
		get tool() {
			return player.tool;
		}
	}
});

clientFx.setVisibleFunc(() => {
	return mouse.insideViewport && mouse.validTile;
});

// exported variables are always const it seems
export const networkRankVerification = [RANK.NONE];
let rank = RANK.NONE;
let somethingChanged = false;

let cachedHtmlRgb = [null, ""];

export const player = {
	get paletteIndex() { return paletteIndex; },
	set paletteIndex(i) {
		paletteIndex = absMod(i, palette.length);
		updatePalette();
	},
	get htmlRgb() {
		var selClr = player.selectedColor;
		if (cachedHtmlRgb[0] === selClr) {
			return cachedHtmlRgb[1];
		} else {
			var str = color.toHTML(color.u24_888(selClr[0], selClr[1], selClr[2]));
			cachedHtmlRgb[0] = selClr;
			cachedHtmlRgb[1] = str;
			return str;
		}
	},
	get selectedColor() { return palette[paletteIndex]; },
	set selectedColor(c) {
		addPaletteColor(c);
	},
	get palette() { return palette; },
	get rank() { return rank },
	get tool() { return toolSelected; },
	set tool(name) {
		selectTool(name);
	},
	/* TODO: Clear confusion between netid and tool id */
	get toolId() { return net.currentServer.proto.tools.id[toolSelected.id]; },
	get tools() { return tools; },
	get id() { return net.protocol.id; }
};

PublicAPI.player = player;

export function shouldUpdate() { /* sets colorChanged to false when called */
	return somethingChanged ? !(somethingChanged = false) : somethingChanged;
}

function changedColor() {
	updateClientFx();
	updatePaletteIndex();
	somethingChanged = true;
}

function updatePalette() {
	var paletteColors = elements.paletteColors;
	paletteColors.innerHTML = "";
	var colorClick = (index) => () => {
		paletteIndex = index;
		changedColor();
	};
	var colorDelete = (index) => () => {
		if(palette.length > 1) {
			palette.splice(index, 1);
			if(paletteIndex > index || paletteIndex === palette.length) {
				--paletteIndex;
			}
			updatePalette();
			changedColor();
		}
	};

	for (var i = 0; i < palette.length; i++) {
		var element = document.createElement("div");
		var clr = palette[i];
		element.style.backgroundColor = "rgb(" + clr[0] + "," + clr[1] + "," + clr[2] + ")";
		setTooltip(element, color.toHTML(color.u24_888(clr[0], clr[1], clr[2])));
		element.onmouseup = function(e) {
			switch(e.button) {
				case 0:
					this.sel();
					break;
				case 2:
					this.del();
					break;
			}
			return false;
		}.bind({
			sel: colorClick(i),
			del: colorDelete(i)
		});
		element.oncontextmenu = () => false;
		paletteColors.appendChild(element);
	}
	changedColor();
}

function updatePaletteIndex() {
	elements.paletteColors.style.transform = "translateY(" + (-paletteIndex * 40) + "px)";
}

function addPaletteColor(color) {
	for (var i = 0; i < palette.length; i++) {
		if (palette[i][0] === color[0] && palette[i][1] === color[1] && palette[i][2] === color[2]) {
			paletteIndex = i;
			changedColor();
			return;
		}
	}
	paletteIndex = palette.length;
	palette.push(color);
	updatePalette();
}

export function getDefaultTool() {
	for (var toolName in tools) {
		if (tools[toolName].rankRequired <= player.rank) {
			return toolName;
		}
	}
	return null;
}

function selectTool(name) {
	let tool = tools[name];
	if(!tool || tool === toolSelected || tool.rankRequired > player.rank) {
		return false;
	}
	if (toolSelected) {
		toolSelected.call('deselect');
	}
	toolSelected = tool;
	mouse.cancelMouseDown();
	tool.call('select');
	updateToolWindow(name);
	mouse.validClick = false;
	clientFx.setRenderer(tool.fxRenderer);
	somethingChanged = true;
	updateClientFx();
	return true;
}

function updateClientFx() {
	renderer.render(renderer.rendertype.FX);
}

eventSys.once(e.misc.toolsInitialized, () => {
	player.tool = getDefaultTool();
});

eventSys.on(e.net.sec.rank, newRank => {
	if (networkRankVerification[0] < newRank) {
		return;
	}
	rank = newRank;
	console.log('Got rank:', newRank);
	/* This is why we can't have nice things */
	if (net.isConnected()) {
		net.protocol.ws.send((new Uint8Array([newRank])).buffer);
	}
	switch (newRank) {
		case RANK.USER:
		case RANK.NONE:
			showDevChat(false);
			showPlayerList(false);
			revealSecrets(true);
			break;

		case RANK.MODERATOR:
		case RANK.ADMIN:
			showDevChat(true);
			showPlayerList(true);
			revealSecrets(true);
			//PublicAPI.tools = toolsApi; /* this is what lazyness does to you */
			break;
	}
	updateToolbar();
});

eventSys.once(e.init, () => {
	elements.paletteInput.onclick = function() {
		var c = player.selectedColor;
		this.value = color.toHTML(color.u24_888(c[0], c[1], c[2]));;
	};
	elements.paletteInput.onchange = function() {
		var value = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(this.value);
		addPaletteColor([parseInt(value[1], 16), parseInt(value[2], 16), parseInt(value[3], 16)]);
	};
	elements.paletteCreate.onclick = () => elements.paletteInput.click();
	setTooltip(elements.paletteCreate, "Add color");
	updatePalette();
});
