'use strict';
import { PublicAPI, eventSys } from './global.js';
import { EVENTS as e, protocol, options, RANK } from './conf.js';
import { absMod, setTooltip } from './util/misc.js';
import { cursors } from './tool_renderer.js';
import { net } from './networking.js';
import { player } from './local_player.js';
import { camera, moveCameraTo, moveCameraBy } from './canvas_renderer.js';
import { windowSys, GUIWindow } from './windowsys.js';
import { misc, elements, mouse } from './main.js';
import { PLAYERFX } from './Fx.js';

export const tools = {};
export let toolsWindow = null;
let windowShown = false;

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
	if (!win) {
		return;
	}
	
	const container = win.container;
	const toolButtonClick = name => event => player.tool = name;
	
	container.innerHTML = "";
	
	// Add tools to the tool-select menu
	for (const name in tools) {
		var tool = tools[name];
		if (!tool.adminTool || player.rank === RANK.ADMIN) {
			var element = document.createElement("button");
			var mask = document.createElement("div");
			setTooltip(element, tool.name + " tool");
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

export function addTool(tool) {
	tools[tool.name.toLowerCase()] = tool;
	updateToolbar();
}

class Tool {
    constructor(name, cursor, fxRenderer, isAdminTool, onInit) {
		this.name = name;
        this.fxRenderer = fxRenderer;
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
			deselect: null,
			keydown: null,
			keyup: null,
			scroll: null,
			tick: null
        };
        onInit(this);
	}
	
	/* Doesn't update if tool already selected */
	setFxRenderer(func) {
		this.fxRenderer = func;
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

PublicAPI.tool = {
	class: Tool,
	addTool,
	updateToolbar,
	allTools: tools
};

eventSys.once(e.misc.toolsRendered, () => {
	// Cursor tool
	addTool(new Tool('Cursor', cursors.cursor, PLAYERFX.RECT_SELECT_ALIGNED(1), false,
		tool => {
			function draw(tileX, tileY, color) {
				var pixel = misc.world.getPixel(tileX, tileY);
				if (pixel !== null && !(color[0] === pixel[0] && color[1] === pixel[1] && color[2] === pixel[2])) {
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
	));
	
	// Move tool
	addTool(new Tool('Move', cursors.move, PLAYERFX.NONE, false,
		tool => {
			function move(x, y, startX, startY) {
				moveCameraBy((startX - x) / 16, (startY - y) / 16);
			}
			tool.setEvent('mousemove', (mouse, event) => {
				if (mouse.buttons !== 0) {
					move(mouse.worldX, mouse.worldY, mouse.mouseDownWorldX, mouse.mouseDownWorldY);
				}
			});
			tool.setEvent('scroll', (mouse, event) => {
				var dx = Math.max(-500, Math.min(event.deltaX, 500));
				var dy = Math.max(-500, Math.min(event.deltaY, 500));
				var pxAmount = Math.max(camera.zoom, 2);
				moveCameraBy(event.deltaX / pxAmount, event.deltaY / pxAmount);
			});
			/*tool.setEvent('touchmove', (mouse, event) => {
				var touch = event.changedTouches[0];
				move(touch.pageX, touch.pageY, );
			});*/
		}
	));
	
	// Pipette tool
	addTool(new Tool('Pipette', cursors.pipette, PLAYERFX.NONE, false,
		tool => {
			tool.setEvent('mousedown mousemove', (mouse, event) => {
				if (mouse.buttons !== 0) {
					var color = misc.world.getPixel(mouse.tileX, mouse.tileY);
					if (color) {
						player.selectedColor = color;
					}
				}
			});
		}
	));
	
	// Erase/Fill tool
	addTool(new Tool('Eraser', cursors.erase, PLAYERFX.RECT_SELECT_ALIGNED(16), true,
		tool => {
			function clearChunk(chunkX, chunkY) {
				const clearColor = 0xFFFFFF; /* White */
				var chunk = misc.world.getChunkAt(chunkX, chunkY);
				if (chunk) {
					var empty = true;
					firstLoop: for (var y = 0; y < protocol.chunkSize; y++) {
						for (var x = 0; x < protocol.chunkSize; x++) {
							if ((chunk.get(x, y) & 0xFFFFFF) != clearColor) {
								empty = false;
								break firstLoop;
							}
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
	));
	
	// Zoom tool
	addTool(new Tool('Zoom', cursors.zoom, PLAYERFX.NONE, false,
		tool => {
			function zoom(mouse, type) {
				var lzoom = camera.zoom;
				var nzoom = camera.zoom;
				var offX = 0;
				var offY = 0;
				var w = window.innerWidth;
				var h = window.innerHeight;
				if (type === 1) {
					// Zoom in
					nzoom *= 1 + options.zoomStrength;
					offX = (mouse.x - w / 2) / nzoom;
					offY = (mouse.y - h / 2) / nzoom;
				} else if (type === 2) {
					// Zoom out
					nzoom /= 1 + options.zoomStrength;
					offX = (mouse.x - w / 2) * (3 / lzoom - 2 / nzoom);
					offY = (mouse.y - h / 2) * (3 / lzoom - 2 / nzoom);
				} else if (type === 3) {
					// Reset zoom (right + left click)
					nzoom = options.defaultZoom;
				}
				nzoom = Math.round(nzoom);
				camera.zoom = nzoom;
				if (camera.zoom !== lzoom) {
					moveCameraBy(offX, offY);
				}
			}
			
			tool.setEvent("mousedown", (mouse, event) => {
				zoom(mouse, mouse.buttons);
			});
			tool.setEvent("touchstart", (mouse, event) => {
				tool.extra.maxTouches = Math.max(tool.extra.maxTouches || 0, event.touches.length);
			});
			tool.setEvent("touchend", (mouse, event) => {
				if (event.touches.length === 0) {
					if (tool.extra.maxTouches > 1) {
						zoom(mouse, tool.extra.maxTouches);
					}
					tool.extra.maxTouches = 0;
				}
			});
		}
	));

	// Fill tool
	addTool(new Tool('Fill', cursors.fill, PLAYERFX.NONE, true, tool => {
		var queue = [];
		var fillingColor = null;
		var defaultFx = PLAYERFX.RECT_SELECT_ALIGNED(1);
		tool.setFxRenderer((fx, ctx, time) => {
			ctx.globalAlpha = 0.8;
			ctx.strokeStyle = fx.extra.player.htmlRgb;
			var z = camera.zoom;
			if (!fillingColor || !fx.extra.isLocalPlayer) {
				defaultFx(fx, ctx, time);
			} else {
				ctx.beginPath();
				for (var i = 0; i < queue.length; i++) {
					ctx.rect((queue[i][0] - camera.x) * z, (queue[i][1] - camera.y) * z, z, z);
				}
				ctx.stroke();
			}
		});
		function tick() {
			const eq = (a, b) => a && b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
			const check = (x, y) => {
				if (eq(misc.world.getPixel(x, y), fillingColor)) {
					queue.unshift([x, y]);
					return true;
				}
				return false;
			};
			if (!queue.length || !fillingColor) {
				return;
			}
			var selClr = player.selectedColor;
			var current = queue.pop();
			var x = current[0];
			var y = current[1];
			var thisClr = misc.world.getPixel(x, y);
			if (eq(thisClr, fillingColor) && !eq(thisClr, selClr)) {
				if (!misc.world.setPixel(x, y, selClr)) {
					queue.push(current);
					return;
				}
				check(x - 1, y);
				check(x, y - 1);
				check(x + 1, y);
				check(x, y + 1);
			}
		}
		tool.setEvent('mousedown', mouse => {
			fillingColor = misc.world.getPixel(mouse.tileX, mouse.tileY);
			if (fillingColor) {
				queue.push([mouse.tileX, mouse.tileY]);
				tool.setEvent('tick', tick);
			}
		});
		tool.setEvent('mouseup deselect', mouse => {
			fillingColor = null;
			queue = [];
			tool.setEvent('tick', null);
		});
	}));

	addTool(new Tool('Paste', cursors.paste, PLAYERFX.NONE, true, tool => {
		tool.setFxRenderer((fx, ctx, time) => {
			var z = camera.zoom;
			var x = fx.extra.player.x;
			var y = fx.extra.player.y;
			var fxx = Math.floor(x / 16) - camera.x;
			var fxy = Math.floor(y / 16) - camera.y;
			if (tool.extra.canvas && fx.extra.isLocalPlayer) {
				ctx.globalAlpha = 0.5 + Math.sin(time / 500) / 4;
				ctx.strokeStyle = "#000000";
				ctx.scale(z, z);
				ctx.drawImage(tool.extra.canvas, fxx, fxy);
				ctx.scale(1 / z, 1 / z);
				ctx.globalAlpha = 0.8;
				ctx.strokeRect(fxx * z, fxy * z, tool.extra.canvas.width * z, tool.extra.canvas.height * z);
				return 0;
			}
		});
		const paint = (tileX, tileY) => {
			var tmpBuffer = new Uint32Array(protocol.chunkSize * protocol.chunkSize);
			var ctx = tool.extra.canvas.getContext("2d");
			var dat = ctx.getImageData(0, 0, tool.extra.canvas.width, tool.extra.canvas.height);
			var u32dat = new Uint32Array(dat.data.buffer);
			var totalChunksW = Math.ceil((absMod(tileX, protocol.chunkSize) + dat.width) / protocol.chunkSize);
			var totalChunksH = Math.ceil((absMod(tileY, protocol.chunkSize) + dat.height) / protocol.chunkSize);
			const getModifiedPixel = (x, y) => {
				var imgY = y - tileY;
				var imgX = x - tileX;
				if (imgY < 0 || imgX < 0 || imgY >= dat.height || imgX >= dat.width) {
					var currentPixel = misc.world.getPixel(x, y);
					return currentPixel ? (currentPixel[2] << 16 | currentPixel[1] << 8 | currentPixel[0])
						: null;
				}
				var img = u32dat[imgY * dat.width + imgX];
				var oldPixel = misc.world.getPixel(x, y);
				var alpha = img >> 24 & 0xFF;
				if (!oldPixel) {
					return null;
				}
				var r = (1 - alpha / 255) * oldPixel[0] + (alpha / 255) * (img       & 0xFF);
				var g = (1 - alpha / 255) * oldPixel[1] + (alpha / 255) * (img >> 8  & 0xFF);
				var b = (1 - alpha / 255) * oldPixel[2] + (alpha / 255) * (img >> 16 & 0xFF);
				var rgb = b << 16 | g << 8 | r;
				return (r == oldPixel[0] && g == oldPixel[1] && b == oldPixel[2]) ? rgb : 0xFF000000 | rgb;
			};
			const getModifiedChunk = (chunkX, chunkY) => {
				var modified = 0;
				var offX = chunkX * protocol.chunkSize;
				var offY = chunkY * protocol.chunkSize;
				for (var y = 0; y < protocol.chunkSize; y++) {
					for (var x = 0; x < protocol.chunkSize; x++) {
						var color = getModifiedPixel(x + offX, y + offY);
						if (color !== null) {
							if (color & 0xFF000000) {
								++modified;
							}
							tmpBuffer[y * protocol.chunkSize + x] = color & 0xFFFFFF;
						} else {
							/* Chunk not loaded... */
							throw new Error(`Couldn't paste -- chunk (${chunkX}, ${chunkY}) is unloaded`);
						}
					}
				}
				return modified ? tmpBuffer : null;
			};
			if (!net.protocol.setChunk) {
				throw new Error("Protocol doesn't support pasting");
			}
			for (var y = Math.floor(tileY / protocol.chunkSize), t = totalChunksH; --t >= 0; y++) {
				for (var x = Math.floor(tileX / protocol.chunkSize), tw = totalChunksW; --tw >= 0; x++) {
					var newChunk = getModifiedChunk(x, y);
					if (newChunk) {
						net.protocol.setChunk(x, y, newChunk);
					}
				}
			}
		}

		tool.setEvent('mousedown', mouse => {
			if (tool.extra.canvas) {
				paint(mouse.tileX, mouse.tileY);
			}
		});
		
		var input = document.createElement("input");
		input.type = "file";
		input.accept = "image/*";
		tool.setEvent('select', () => {
			input.onchange = event => {
				if (input.files && input.files[0]) {
					var reader = new FileReader();
					reader.onload = e => {
						var image = new Image();
						image.onload = () => {
							tool.extra.canvas = document.createElement("canvas");
							tool.extra.canvas.width = image.width;
							tool.extra.canvas.height = image.height;
							var ctx = tool.extra.canvas.getContext("2d");
							ctx.drawImage(image, 0, 0);
							console.log('Loaded image');
						};
						image.src = e.target.result;
					};
					reader.readAsDataURL(input.files[0]);
				}
			};
			input.click();
		});
	}));

	eventSys.emit(e.misc.toolsInitialized);
});

eventSys.once(e.init, () => {
	toolsWindow = new GUIWindow('Tools', {}, wdow => {
		wdow.container.id = "toole-container";
		wdow.container.style.cssText = "max-width: 40px";
	}).move(5, 32);
});

eventSys.once(e.misc.toolsInitialized, () => {
	updateToolbar();
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