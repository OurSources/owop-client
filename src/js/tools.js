'use strict';
import { PublicAPI, eventSys } from './global.js';
import { EVENTS as e, protocol, options } from './conf.js';
import { cursors } from './tool_renderer.js';
import { net } from './networking.js';
import { player } from './local_player.js';
import { camera, moveCameraTo, moveCameraBy } from './canvas_renderer.js';
import { windowSys, GUIWindow } from './windowsys.js';
import { misc, elements, mouse } from './main.js';

export const tools = {};
export let toolsWindow = null;

PublicAPI.tools = tools;

export function updateToolWindow(name) {
	if (!toolsWindow) {
		return;
	}
	let tool = tools[name];
	var children = toolsWindow.container.children;
	for (var i = 0; i < children.length; i++) {
		children[i].className = "";
		children[i].children[0].style.backgroundImage = "url(" + cursors.set.src + ")";
	}
	var element = document.getElementById("tool-" + name);
	var container = element.children[0];
	container.style.backgroundImage = "url(" + cursors.slotset + ")";
	element.className = "selected";
	elements.viewport.style.cursor = "url(" + tool.cursorblob + ") " + tool.offset[0] + " " + tool.offset[1] + ", pointer";
}

export function updateToolbar(win = toolsWindow) {
	const container = win.container;
	const toolButtonClick = name => event => player.tool = name;
	
	container.innerHTML = "";
	
	// Add tools to the tool-select menu
	for (const name in tools) {
		var tool = tools[name];
		if (!tool.adminTool || player.rank === "ADMIN") {
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

class Tool {
    constructor(cursor, fxType, isAdminTool, onInit) {
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
            click: null,
            touch: null,
            select: null,
            keypress: null
        };
        onInit(this);
    }

    setEvent(type, func) {
        this.events[type] = func || null;
    }

    call(type, data) {
        var func = this.events[type];
        if (func) {
            return func.apply(this, data);
        }
        else if (type === "touch") {
            return this.defaultTouchHandler.apply(this, data);
        }
        return false;
    }

    defaultTouchHandler(touches, type) {
        var click = this.events.click;
        if (click) {
            for (var i = 0; i < touches.length; i++) {
                click(touches[i].pageX, touches[i].pageY, 1, type !== 0);
            }
        }
    }
}

eventSys.once(e.misc.toolsRendered, () => {
	// Cursor tool
	tools['cursor'] = new Tool(cursors.cursor, 0, false,
		tool => {
			function draw(tileX, tileY, color) {
				var pixel = misc.world.getPixel(tileX, tileY);
				if (pixel !== null && !(color[0] === pixel[0] && color[1] === pixel[1] && color[2] === pixel[2])) {
					// TODO
					//wop.undoHistory.push([tileX, tileY, pixel]);
					misc.world.setPixel(tileX, tileY, color);
				}
			}
			
			tool.setEvent('click', (x, y, buttons, isDrag) => {
				var tileX = Math.floor(camera.x + (x / camera.zoom));
				var tileY = Math.floor(camera.y + (y / camera.zoom));
				/* White color if right clicking */
				var color = buttons === 2 ? [255, 255, 255] : player.selectedColor;
				switch (buttons) {
				case 1:
				case 2:
					draw(tileX, tileY, color);
					break;
				case 4:
					player.selectedColor = pixel;
					break;
				}
			});
		}
	);
	
	// Move tool
	tools['move'] = new Tool(cursors.move, -1, false,
		tool => {
			var extra = tool.extra;
			function move(x, y, isDrag) {
				if (!isDrag) {
					extra.startX = camera.x + (x / camera.zoom);
					extra.startY = camera.y + (y / camera.zoom);
				} else {
					moveCameraTo(extra.startX - (x / camera.zoom), extra.startY - (y / camera.zoom));
				}
			}
			tool.setEvent("click", (x, y, buttons, isDrag) => {
				move(x, y, isDrag);
			});
			tool.setEvent("touch", (touches, type) => {
				move(touches[0].pageX, touches[0].pageY, type !== 0);
			});
		}
	);
	
	// Pipette tool
	tools['pipette'] = new Tool(cursors.pipette, -1, false,
		tool => {
			tool.setEvent("click", (x, y, buttons, isDrag) => {
				var tileX = Math.floor(camera.x + (x / camera.zoom));
				var tileY = Math.floor(camera.y + (y / camera.zoom));
				
				var color = misc.world.getPixel(tileX, tileY);
				if (color) {
					player.selectedColor = color;
				}
			});
		}
	);
	
	// Erase/Fill tool
	tools['erase'] = new Tool(cursors.fill, 3, true,
		tool => {
			/*var chunk16X = Math.floor((camera.x + (x / camera.zoom)) / protocol.chunkSize);
			var chunk16Y = Math.floor((camera.y + (y / camera.zoom)) / protocol.chunkSize);
			
			var fill = false;
			var fl = Math.floor;
			var chunk = this.chunks[[fl(chunk16X / protocol.chunkSize), fl(chunk16Y / protocol.chunkSize)]];
			var color = buttons == 2 ? [255, 255, 255] : this.palette[this.paletteIndex];
			if (!chunk || !net.isConnected()) {
				return;
			}
			var offx = chunk16X * 16;
			var offy = chunk16Y * 16;
			for (var x = 16; x--;){
				for (var y = 16; y--;) {
					var cclr = this.getPixel(offx + x, offy + y);
					if (!(cclr[0] == color[0] && cclr[1] == color[1] && cclr[2] == color[2])) {
						fill = true;
						chunk.update((offx + x) & 0xFF, (offy + y) & 0xFF, color);
					}
				}
			}
			if (fill) {
				var array = new ArrayBuffer(10);
				var dv = new DataView(array);
				dv.setInt32(0, chunk16X, true);
				dv.setInt32(4, chunk16Y, true);
				dv.setUint16(8, u16_565(color[2], color[1], color[0]), true);
				this.net.connection.send(array);
			}*/
		}
	);
	
	// Zoom tool
	tools['zoom'] = new Tool(cursors.zoom, -1, false,
		tool => {
			function zoom(x, y, buttons, isDrag) {
				if (!isDrag) {
					var lzoom = camera.zoom;
					var offX = 0;
					var offY = 0;
					if (buttons === 1 && camera.zoom * (1 + options.zoomStrength) <= options.zoomLimitMax) {
						// Zoom in
						camera.zoom *= 1 + options.zoomStrength;
						offX = mouse.x / camera.zoom;
						offY = mouse.y / camera.zoom;
					} else if (buttons === 2 && camera.zoom / (1 + options.zoomStrength) >= options.zoomLimitMin) {
						// Zoom out
						camera.zoom /= 1 + options.zoomStrength;
						offX = mouse.x * (3 / lzoom - 2 / camera.zoom);
						offY = mouse.y * (3 / lzoom - 2 / camera.zoom);
					} else if (buttons === 3) {
						// Reset zoom (right + left click)
						camera.zoom = options.defaultZoom;
					}
					moveCameraBy(camera.x + offX, camera.y + offY);
				}
			}
			
			tool.setEvent("click", zoom);
			tool.setEvent("touch", (touches, type) => {
				var lzoom = camera.zoom;
				if (type === 0 && touches[0].identifier === 1 && camera.zoom / (1 + options.zoomStrength) >= options.zoomLimitMin) {
					// Zoom out
					camera.zoom /= 1 + this.options.zoomStrength;
					camera.x += this.mouse.x * (3 / lzoom - 2 / this.camera.zoom);
					camera.y += this.mouse.y * (3 / lzoom - 2 / this.camera.zoom);
				}
				/*if (lzoom !== this.camera.zoom) {
					camera.zoom = 
					eventSys.emit(e.camera.zoom, this.camera.zoom);
				}*/
			});
		}
	);
	eventSys.emit(e.misc.toolsInitialized);
});

eventSys.once(e.misc.toolsInitialized, () => {
	toolsWindow = windowSys.addWindow(new GUIWindow('Tools', {}, wdow => {
		wdow.container.id = "toole-container";
		updateToolbar(wdow);
	}).move(5, 32));
});