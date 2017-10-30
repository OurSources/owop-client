'use strict';
import { eventSys, PublicAPI } from './global.js';
import { EVENTS as e, RANK } from './conf.js';
import { openColorPicker, absMod, setTooltip } from './util/misc.js';
import { elements, mouse, misc, showDevChat } from './main.js';
import { colorUtils as color } from './util/color.js';
import { renderer } from './canvas_renderer.js';
import { cursors } from './tool_renderer.js';
import { tools, updateToolbar, updateToolWindow } from './tools.js';
import { Fx } from './Fx.js';
import { net } from './networking.js';

export { updateClientFx };

let toolSelected = null;

const palette = [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255]];
let paletteIndex = 0;

export const undoHistory = [];

const clientFx = new Fx(-1, 0, 0, { color: 0 });

let rank = RANK.NONE;
let somethingChanged = false;

export const player = {
	get paletteIndex() { return paletteIndex; },
	set paletteIndex(i) {
		paletteIndex = absMod(i, palette.length);
		updatePalette();
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
	get toolId() { return tools[toolSelected].id; }, /* TODO */
	get tools() { return tools; }
};

PublicAPI.player = player;

export function shouldUpdate() { /* sets colorChanged to false when called */
	return somethingChanged ? !(somethingChanged = false) : somethingChanged;
}

function changedColor() {
	updateClientFx(true);
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

function selectTool(name) {
	let tool = tools[name];
	if(!tool || tool === toolSelected) {
		return;
	}
	toolSelected = tool;
	mouse.cancelMouseDown();
	tool.call("select");
	updateToolWindow(name);
	mouse.validClick = false;
	clientFx.type = tool.fxType;
	somethingChanged = true;
	updateClientFx(true);
}

function updateClientFx(force) {
	var fxtileX = clientFx.x;
	var fxtileY = clientFx.y;
	var tileX   = Math.floor(mouse.worldX / 16);
	var tileY   = Math.floor(mouse.worldY / 16);
	var rgb = player.selectedColor;
	    rgb = color.u24_888(rgb[0], rgb[1], rgb[2]);
	var tool = toolSelected;
	if (tool && (fxtileX !== tileX || fxtileY !== tileY || force)) {
		var valid = misc.world !== null && misc.world.validMousePos(tileX, tileY);
		if (valid) {
			clientFx.update(tool.fxType, tileX, tileY, {color: rgb});
		} else {
			clientFx.update(-1, tileX, tileY, {color: rgb});
		}
		renderer.render(renderer.rendertype.FX);
		return true;
	}
	return false;
}

eventSys.on(e.misc.toolsInitialized, () => {
	player.tool = "cursor";
});

eventSys.on(e.net.sec.rank, newRank => {
	rank = newRank;
	switch (newRank) {
		case RANK.NONE:
			break;

		case RANK.USER:
			showDevChat(false);
			break;

		case RANK.ADMIN:
			showDevChat(true);
			net.protocol.placeBucket.time = 0;
			net.protocol.chatBucket.time = 0;
			updateToolbar();
			break;
	}
	updateToolbar();
});

eventSys.once(e.init, () => {
	elements.paletteCreate.onclick = () => openColorPicker(player.selectedColor, addPaletteColor);
	updatePalette();
});