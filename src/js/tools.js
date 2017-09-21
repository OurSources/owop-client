'use strict';
import { PublicAPI, eventSys } from './global.js';
import { EVENTS as e, protocol, options, RANK } from './conf.js';
import { cursors } from './tool_renderer.js';
import { net } from './networking.js';
import { player } from './local_player.js';
import { camera, moveCameraTo, moveCameraBy } from './canvas_renderer.js';
import { windowSys, GUIWindow } from './windowsys.js';
import { misc, elements, mouse } from './main.js';
import { FXTYPE } from './Fx.js';

export const tools = {};
export let toolsWindow = null;
let windowShown = false;

PublicAPI.tools = tools;

export function updateToolWindow(name) {
	if (!toolsWindow) {
		return;
	}
	let tool = tools[name];
	var children = toolsWindow.container.children;
	for (var i = 0; i < children.length; i++) {
		var button = children[i];
		var isSelected = button.id.split('-')[1] === name;
		button.className = isSelected ? 'selected' : '';
		button.children[0].style.backgroundImage = "url(" + (isSelected ? cursors.slotset : cursors.set.src) + ")";
	}
	elements.viewport.style.cursor = "url(" + tool.cursorblob + ") " + tool.offset[0] + " " + tool.offset[1] + ", pointer";
}

export function updateToolbar(win = toolsWindow) {
	const container = win.container;
	const toolButtonClick = name => event => player.tool = name;
	
	container.innerHTML = "";
	
	// Add tools to the tool-select menu
	for (const name in tools) {
		var tool = tools[name];
		if (!tool.adminTool || player.rank === RANK.ADMIN) {
			var element = document.createElement("button");
			var mask = document.createElement("div");
			element.id = "tool-" + name;
			element.addEventListener("click", toolButtonClick(name));
			if (tool === player.tool) {
				mask.style.backgroundImage = "url(" + cursors.slotset + ")";
				element.className = "selected";
			} else {
				mask.style.backgroundImage = "url(" + cursors.set.src + ")";
			}
			mask.style.backgroundPosition = tool.setposition;
			element.appendChild(mask);
			container.appendChild(element);
		}
	}
}

export function showToolsWindow(bool) {
	if (windowShown !== bool) {
		if (bool && toolsWindow) {
			windowSys.addWindow(toolsWindow);
		} else if (toolsWindow) {
			windowSys.delWindow(toolsWindow);
		}
		windowShown = bool;
	}
}

class Tool {
    constructor(name, cursor, fxType, isAdminTool, onInit) {
		this.name = name;
        this.fxType = fxType;
        this.cursorblob = cursor.img.shadowblob;
        this.cursor = cursor.img.shadowed;
        this.setposition = (-cursor.imgpos[0] * 36) + "px " + (-cursor.imgpos[1] * 36) + "px";
        this.offset = cursor.hotspot;
        this.adminTool = isAdminTool;
        this.extra = {}; /* Extra storage for tools */
        this.events = {
			mouseup: null,
			mousedown: null,
			mousemove: null,
			touchstart: null,
			touchmove: null,
			touchend: null,
			touchcancel: null,
            select: null,
			keydown: null,
			keyup: null
        };
        onInit(this);
    }

    setEvent(type, func) {
		var events = type.split(' ');
		for (var i = 0; i < events.length; i++) {
			this.events[events[i]] = func || null;
		}
    }

    call(type, data) {
        var func = this.events[type];
        if (func) {
            return func.apply(this, data);
        } else if (type.indexOf("touch") === 0) {
            return this.defaultTouchHandler(type.slice(5), data);
        }
        return false;
    }

    defaultTouchHandler(type, data) {
		var mouse = data[0];
		var event = data[1]; /* hmm... */
		var handlers = {
			start: this.events.mousedown,
			move: this.events.mousemove,
			end: this.events.mouseup,
			cancel: this.events.mouseup
		};
		var handler = handlers[type];
		if (handler) {
			var touches = event.changedTouches;
			for (var i = 0; i < touches.length; i++) {
				mouse.x = touches[i].pageX;
				mouse.y = touches[i].pageY;
				handler.apply(this, data);
			}
		}
    }
}

PublicAPI.toolClass = Tool;

eventSys.once(e.misc.toolsRendered, () => {
	// Cursor tool
	tools['cursor'] = new Tool('cursor', cursors.cursor, FXTYPE.PIXEL_SELECT, false,
		tool => {
			function draw(tileX, tileY, color) {
				var pixel = misc.world.getPixel(tileX, tileY);
				if (pixel !== null && !(color[0] === pixel[0] && color[1] === pixel[1] && color[2] === pixel[2])) {
					// TODO
					//wop.undoHistory.push([tileX, tileY, pixel]);
					misc.world.setPixel(tileX, tileY, color);
				}
			}
			
			tool.setEvent('mousedown mousemove', (mouse, event) => {
				/* White color if right clicking */
				var color = mouse.buttons === 2 ? [255, 255, 255] : player.selectedColor;
				switch (mouse.buttons) {
				case 1:
				case 2:
					draw(mouse.tileX, mouse.tileY, color);
					break;
				case 4:
					var pixel = misc.world.getPixel(mouse.tileX, mouse.tileY);
					if (pixel) {
						player.selectedColor = pixel;
					}
					break;
				}
			});
		}
	);
	
	// Move tool
	tools['move'] = new Tool('move', cursors.move, FXTYPE.NONE, false,
		tool => {
			function move(x, y, startX, startY) {
				moveCameraBy((startX - x) / 16, (startY - y) / 16);
			}
			tool.setEvent('mousemove', (mouse, event) => {
				if (mouse.buttons !== 0) {
					move(mouse.worldX, mouse.worldY, mouse.mouseDownWorldX, mouse.mouseDownWorldY);
				}
			});
			/*tool.setEvent('touchmove', (mouse, event) => {
				var touch = event.changedTouches[0];
				move(touch.pageX, touch.pageY, );
			});*/
		}
	);
	
	// Pipette tool
	tools['pipette'] = new Tool('pipette', cursors.pipette, FXTYPE.NONE, false,
		tool => {
			tool.setEvent('mousedown', (mouse, event) => {
				var color = misc.world.getPixel(mouse.tileX, mouse.tileY);
				if (color) {
					player.selectedColor = color;
				}
			});
		}
	);
	
	// Erase/Fill tool
	tools['erase'] = new Tool('erase', cursors.erase, FXTYPE.CHUNK_UPDATE, true,
		tool => {
			function clearChunk(chunkX, chunkY) {
				const clearColor = 0xFFFFFF; /* White */
				var chunk = misc.world.getChunkAt(chunkX, chunkY);
				if (chunk) {
					var empty = true;
					for (var i = 0; i < chunk.u32data.length; i++) {
						if ((chunk.u32data[i] & 0xFFFFFF) != clearColor) {
							empty = false;
							break;
						}
					}
					if (!empty) {
						chunk.set(clearColor);
						net.protocol.clearChunk(chunkX, chunkY);
					}
				}
			}
			
			tool.setEvent('mousedown mousemove', (mouse, event) => {
				if (mouse.buttons === 1) {
					clearChunk(Math.floor(mouse.tileX / protocol.chunkSize), Math.floor(mouse.tileY / protocol.chunkSize));
				}
			});
		}
	);
	
	// Zoom tool
	tools['zoom'] = new Tool('zoom', cursors.zoom, -1, false,
		tool => {
			function zoom(mouse, type) {
				var lzoom = camera.zoom;
				var offX = 0;
				var offY = 0;
				var w = window.innerWidth;
				var h = window.innerHeight;
				if (type === 1 && camera.zoom * (1 + options.zoomStrength) <= options.zoomLimitMax) {
					// Zoom in
					camera.zoom *= 1 + options.zoomStrength;
					offX = (mouse.x - w / 2) / camera.zoom;
					offY = (mouse.y - h / 2) / camera.zoom;
				} else if (type === 2 && camera.zoom / (1 + options.zoomStrength) >= options.zoomLimitMin) {
					// Zoom out
					camera.zoom /= 1 + options.zoomStrength;
					offX = (mouse.x - w / 2) * (3 / lzoom - 2 / camera.zoom);
					offY = (mouse.y - h / 2) * (3 / lzoom - 2 / camera.zoom);
				} else if (type === 3) {
					// Reset zoom (right + left click)
					camera.zoom = options.defaultZoom;
				}
				moveCameraBy(offX, offY);
			}
			
			tool.setEvent("mousedown", (mouse, event) => {
				zoom(mouse, mouse.buttons);
			});
			tool.setEvent("touchstart", (mouse, event) => {
				zoom(mouse, event.changedTouches[0].identifier + 1);
			});
		}
	);
	eventSys.emit(e.misc.toolsInitialized);
});

eventSys.once(e.misc.toolsInitialized, () => {
	toolsWindow = new GUIWindow('Tools', {}, wdow => {
		wdow.container.id = "toole-container";
		wdow.container.style = "max-width: 40px";
		updateToolbar(wdow);
	}).move(5, 32);

	if (windowShown) {
		windowSys.addWindow(toolsWindow);
	}
});

eventSys.on(e.net.disconnected, () => {
	showToolsWindow(false);
});

eventSys.on(e.misc.worldInitialized, () => {
	showToolsWindow(true);
});