'use strict';
import { PublicAPI, eventSys } from './global.js';
import { EVENTS as e, protocol, options, RANK } from './conf.js';
import { absMod, setTooltip, mkHTML, line } from './util/misc.js';
import { cursors } from './tool_renderer.js';
import { net } from './networking.js';
import { player } from './local_player.js';
import { camera, moveCameraTo, moveCameraBy, renderer, drawText } from './canvas_renderer.js';
import { windowSys, GUIWindow, UtilDialog } from './windowsys.js';
import { misc, elements, mouse, sounds, keysDown } from './main.js';
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
	const toolButtonClick = name => event => {
		player.tool = name;
		sounds.play(sounds.click);
	};

	container.innerHTML = "";

	// Add tools to the tool-select menu
	for (const name in tools) {
		var tool = tools[name];
		if (player.rank >= tool.rankRequired) {
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
	tool.id = tool.name.toLowerCase();
	tools[tool.id] = tool;
	updateToolbar();
}

class Tool {
	constructor(name, cursor, fxRenderer, rankNeeded, onInit) {
		this.name = name;
		this.id = null;
		this.fxRenderer = fxRenderer;
		this.cursorblob = cursor.img.shadowblob;
		this.cursor = cursor.img.shadowed;
		this.setposition = (-cursor.imgpos[0] * 36) + "px " + (-cursor.imgpos[1] * 36) + "px";
		this.offset = cursor.hotspot;
		this.rankRequired = rankNeeded;
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

	isEventDefined(type) {
		return type in this.events;
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
	addToolObject: addTool,
	updateToolbar,
	allTools: tools
};

eventSys.once(e.misc.toolsRendered, () => {
	// Cursor tool
	addTool(new Tool('Cursor', cursors.cursor, PLAYERFX.RECT_SELECT_ALIGNED(1), RANK.USER,
		tool => {
			var lastX,
				lastY;
			tool.setEvent('mousedown mousemove', (mouse, event) => {
				var usedButtons = 0b11; /* Left and right mouse buttons are always used... */
				/* White color if right clicking */
				var color = mouse.buttons === 2 ? [255, 255, 255] : player.selectedColor;
				switch (mouse.buttons) {
					case 1:
					case 2:
						if (!lastX || !lastY) {
							lastX = mouse.tileX;
							lastY = mouse.tileY;
						}
						line(lastX, lastY, mouse.tileX, mouse.tileY, 1, (x, y) => {
							var pixel = misc.world.getPixel(x, y);
							if (pixel !== null && !(color[0] === pixel[0] && color[1] === pixel[1] && color[2] === pixel[2])) {
								misc.world.setPixel(x, y, color);
							}
						});
						lastX = mouse.tileX;
						lastY = mouse.tileY;
						break;
					case 4:
						if (event.ctrlKey) {
							usedButtons |= 0b100;
							var color = misc.world.getPixel(mouse.tileX, mouse.tileY);
							if (color) {
								player.selectedColor = color;
							}
						}
						break;
				}
				return usedButtons;
			});
			tool.setEvent('mouseup', mouse => {
				lastX = null;
				lastY = null;
			});
		}
	));

	// Move tool
	addTool(new Tool('Move', cursors.move, PLAYERFX.NONE, RANK.NONE,
		tool => {
			function move(x, y, startX, startY) {
				moveCameraBy((startX - x) / 16, (startY - y) / 16);
			}
			tool.setEvent('mousemove', (mouse, event) => {
				if (mouse.buttons !== 0) {
					move(mouse.worldX, mouse.worldY, mouse.mouseDownWorldX, mouse.mouseDownWorldY);
					return mouse.buttons;
				}
			});
			tool.setEvent('scroll', (mouse, event, rawEvent) => {
				if (!rawEvent.ctrlKey) {
					var dx = Math.max(-500, Math.min(event.spinX * 16, 500));
					var dy = Math.max(-500, Math.min(event.spinY * 16, 500));
					var pxAmount = camera.zoom//Math.max(camera.zoom, 2);
					moveCameraBy(dx / pxAmount, dy / pxAmount);
					return true;
				}
			});
		}
	));

	// Pipette tool
	addTool(new Tool('Pipette', cursors.pipette, PLAYERFX.NONE, RANK.NONE,
		tool => {
			tool.setEvent('mousedown mousemove', (mouse, event) => {
				if (mouse.buttons !== 0 && !(mouse.buttons & 0b100)) {
					var color = misc.world.getPixel(mouse.tileX, mouse.tileY);
					if (color) {
						player.selectedColor = color;
					}
					return mouse.buttons;
				}
			});
		}
	));

	// Erase/Fill tool
	addTool(new Tool('Eraser', cursors.erase, PLAYERFX.RECT_SELECT_ALIGNED(16), RANK.MODERATOR,
		tool => {
			function fillChunk(chunkX, chunkY, c) {
				const color = c[2] << 16 | c[1] << 8 | c[0];
				var chunk = misc.world.getChunkAt(chunkX, chunkY);
				if (chunk) {
					var empty = true;
					firstLoop: for (var y = 0; y < protocol.chunkSize; y++) {
						for (var x = 0; x < protocol.chunkSize; x++) {
							if ((chunk.get(x, y) & 0xFFFFFF) != color) {
								empty = false;
								break firstLoop;
							}
						}
					}
					if (!empty) {
						if (net.protocol.clearChunk(chunkX, chunkY, c)) {
							chunk.set(color);
						}
					}
				}
			}

			tool.setEvent('mousedown mousemove', (mouse, event) => {
				if (mouse.buttons & 0b1) {
					fillChunk(Math.floor(mouse.tileX / protocol.chunkSize), Math.floor(mouse.tileY / protocol.chunkSize), player.selectedColor);
					return 1;
				} else if (mouse.buttons & 0b10) {
					fillChunk(Math.floor(mouse.tileX / protocol.chunkSize), Math.floor(mouse.tileY / protocol.chunkSize), [255, 255, 255]);
					return 1;
				}
			});
		}
	));

	// Zoom tool
	addTool(new Tool('Zoom', cursors.zoom, PLAYERFX.NONE, RANK.NONE,
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

	// Area to PNG tool
	addTool(new Tool('Export', cursors.select, PLAYERFX.NONE, RANK.NONE,
		tool => {
			tool.setFxRenderer((fx, ctx, time) => {
				if (!fx.extra.isLocalPlayer) return 1;
				var x = fx.extra.player.x;
				var y = fx.extra.player.y;
				var fxx = (Math.floor(x / 16) - camera.x) * camera.zoom;
				var fxy = (Math.floor(y / 16) - camera.y) * camera.zoom;
				var oldlinew = ctx.lineWidth;
				ctx.lineWidth = 1;
				if (tool.extra.end) {
					var s = tool.extra.start;
					var e = tool.extra.end;
					var x = (s[0] - camera.x) * camera.zoom + 0.5;
					var y = (s[1] - camera.y) * camera.zoom + 0.5;
					var w = e[0] - s[0];
					var h = e[1] - s[1];
					ctx.beginPath();
					ctx.rect(x, y, w * camera.zoom, h * camera.zoom);
					ctx.globalAlpha = 1;
					ctx.strokeStyle = "#FFFFFF";
					ctx.stroke();
					ctx.setLineDash([3, 4]);
					ctx.strokeStyle = "#000000";
					ctx.stroke();
					ctx.globalAlpha = 0.25 + Math.sin(time / 500) / 4;
					ctx.fillStyle = renderer.patterns.unloaded;
					ctx.fill();
					ctx.setLineDash([]);
					var oldfont = ctx.font;
					ctx.font = "16px sans-serif";
					var txt = `${!tool.extra.clicking ? "Right click to screenshot " : ""}(${Math.abs(w)}x${Math.abs(h)})`;
					var txtx = window.innerWidth >> 1;
					var txty = window.innerHeight >> 1;
					txtx = Math.max(x, Math.min(txtx, x + w * camera.zoom));
					txty = Math.max(y, Math.min(txty, y + h * camera.zoom));

					drawText(ctx, txt, txtx, txty, true);
					ctx.font = oldfont;
					ctx.lineWidth = oldlinew;
					return 0;
				} else {
					ctx.beginPath();
					ctx.moveTo(0, fxy + 0.5);
					ctx.lineTo(window.innerWidth, fxy + 0.5);
					ctx.moveTo(fxx + 0.5, 0);
					ctx.lineTo(fxx + 0.5, window.innerHeight);

					//ctx.lineWidth = 1;
					ctx.globalAlpha = 1;
					ctx.strokeStyle = "#FFFFFF";
					ctx.stroke();
					ctx.setLineDash([3]);
					ctx.strokeStyle = "#000000";
					ctx.stroke();

					ctx.setLineDash([]);
					ctx.lineWidth = oldlinew;
					return 1;
				}
			});

			function dlarea(x, y, w, h, onblob){
				var c = document.createElement('canvas');
				c.width = w;
				c.height = h;
				var ctx = c.getContext('2d');
				var d = ctx.createImageData(w, h);
				for(var i = y; i < y + h; i++){
				  for(var j = x; j < x + w; j++){
					var pix = misc.world.getPixel(j, i);
					if (!pix) continue;
					d.data[4*((i - y)*w + (j - x))] = pix[0];
					d.data[4*((i - y)*w + (j - x)) + 1] = pix[1];
					d.data[4*((i - y)*w + (j - x)) + 2] = pix[2];
					d.data[4*((i - y)*w + (j - x)) + 3] = 255;
				  }
				}
				ctx.putImageData(d, 0, 0);
				c.toBlob(onblob);
			  }

			tool.extra.start = null;
			tool.extra.end = null;
			tool.extra.clicking = false;

			tool.setEvent('mousedown', (mouse, event) => {
				var s = tool.extra.start;
				var e = tool.extra.end;
				const isInside = () => mouse.tileX >= s[0] && mouse.tileX < e[0] && mouse.tileY >= s[1] && mouse.tileY < e[1];
				if (mouse.buttons === 1 && !tool.extra.end) {
					tool.extra.start = [mouse.tileX, mouse.tileY];
					tool.extra.clicking = true;
					tool.setEvent('mousemove', (mouse, event) => {
						if (tool.extra.start && mouse.buttons === 1) {
							tool.extra.end = [mouse.tileX, mouse.tileY];
							return 1;
						}
					});
					const finish = () => {
						tool.setEvent('mousemove mouseup deselect', null);
						tool.extra.clicking = false;
						var s = tool.extra.start;
						var e = tool.extra.end;
						if (e) {
							if (s[0] === e[0] || s[1] === e[1]) {
								tool.extra.start = null;
								tool.extra.end = null;
							}
							if (s[0] > e[0]) {
								var tmp = e[0];
								e[0] = s[0];
								s[0] = tmp;
							}
							if (s[1] > e[1]) {
								var tmp = e[1];
								e[1] = s[1];
								s[1] = tmp;
							}
						}
						renderer.render(renderer.rendertype.FX);
					};
					tool.setEvent('deselect', finish);
					tool.setEvent('mouseup', (mouse, event) => {
						if (!(mouse.buttons & 1)) {
							finish();
						}
					});
				} else if (mouse.buttons === 1 && tool.extra.end) {
					if (isInside()) {
						var offx = mouse.tileX;
						var offy = mouse.tileY;
						tool.setEvent('mousemove', (mouse, event) => {
							var dx = mouse.tileX - offx;
							var dy = mouse.tileY - offy;
							tool.extra.start = [s[0] + dx, s[1] + dy];
							tool.extra.end = [e[0] + dx, e[1] + dy];
						});
						const end = () => {
							tool.setEvent('mouseup deselect mousemove', null);
						};
						tool.setEvent('deselect', end);
						tool.setEvent('mouseup', (mouse, event) => {
							if (!(mouse.buttons & 1)) {
								end();
							}
						});
					} else {
						tool.extra.start = null;
						tool.extra.end = null;
					}
				} else if (mouse.buttons === 2 && tool.extra.end && isInside()) {
					tool.extra.start = null;
					tool.extra.end = null;
					var cvs = dlarea(s[0], s[1], e[0] - s[0], e[1] - s[1], b => {
						var url = URL.createObjectURL(b);
						var img = new Image();
						img.onload = () => {
							windowSys.addWindow(new GUIWindow("Resulting image", {
								centerOnce: true,
								closeable: true
							}, function(win) {
								var props = ['width', 'height'];
								if (img.width > img.height) {
									props.reverse();
								}
								var r = img[props[0]] / img[props[1]];
								var shownSize = img[props[1]] >= 128 ? 256 : 128;
								img[props[0]] = r * shownSize;
								img[props[1]] = shownSize;
								win.container.classList.add('centeredChilds')
								var image = win.addObj(img);
								setTooltip(img, "Right click to copy/save!");
								/*var okButton = win.addObj(mkHTML("button", {
									innerHTML: "OK",
									style: "display: block; width: 80px; height: 30px; margin: auto;",
									onclick: function() {
										img.remove();
										URL.revokeObjectURL(url);
										win.getWindow().close();
									}
								}));*/
							}));
						};
						img.src = url;
					});
				}
			});
		}
	));

	// Fill tool
	addTool(new Tool('Fill', cursors.fill, PLAYERFX.NONE, RANK.USER, tool => {
		tool.extra.tickAmount = 9;
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
			var painted = 0;
			var tickAmount = tool.extra.tickAmount;
			if (keysDown[17]) { /* Ctrl */
				tickAmount *= 3;
			}

			for (var painted = 0; painted < tickAmount && queue.length; painted++) {
				var current = queue.pop();
				var x = current[0];
				var y = current[1];
				var thisClr = misc.world.getPixel(x, y);
				if (eq(thisClr, fillingColor) && !eq(thisClr, selClr)) {
					if (!misc.world.setPixel(x, y, selClr)) {
						queue.push(current);
						break;
					}

					// diamond check first
					var top = check(x, y - 1);
					var bottom = check(x, y + 1);
					var left = check(x - 1, y);
					var right = check(x + 1, y);

					// if corners are not closed by parts of the diamond, then they can be accessed
					if (top && left) {
						check(x - 1, y - 1);
					}
					if (top && right) {
						check(x + 1, y - 1);
					}
					if (bottom && left) {
						check(x - 1, y + 1);
					}
					if (bottom && right) {
						check(x + 1, y + 1);
					}

					// Shape diamond, infra not like
					/*check(x    , y - 1);
					check(x - 1, y    );
					check(x + 1, y    );
					check(x    , y + 1);*/
				}
			}
		}
		tool.setEvent('mousedown', mouse => {
			if (!(mouse.buttons & 0b100)) {
				fillingColor = misc.world.getPixel(mouse.tileX, mouse.tileY);
				if (fillingColor) {
					queue.push([mouse.tileX, mouse.tileY]);
					tool.setEvent('tick', tick);
				}
			}
		});
		tool.setEvent('mouseup deselect', mouse => {
			if (!mouse || !(mouse.buttons & 0b1)) {
				fillingColor = null;
				queue = [];
				tool.setEvent('tick', null);
			}
		});
	}));

	addTool(new Tool('Line', cursors.wand, PLAYERFX.NONE, RANK.USER, tool => {
		var start = null;
		var end = null;
		var queue = [];
		function line(x1, y1, x2, y2, plot) {
			var dx =  Math.abs(x2 - x1), sx = x1 < x2 ? 1 : -1;
			var dy = -Math.abs(y2 - y1), sy = y1 < y2 ? 1 : -1;
			var err = dx + dy,
				e2;

			while(true) {
				plot(x1, y1);
				if (x1 == x2 && y1 == y2) break;
				e2 = 2 * err;
				if (e2 >= dy) { err += dy; x1 += sx; }
				if (e2 <= dx) { err += dx; y1 += sy; }
			}
		}
		var defaultFx = PLAYERFX.RECT_SELECT_ALIGNED(1);
		tool.setFxRenderer((fx, ctx, time) => {
			ctx.globalAlpha = 0.8;
			ctx.strokeStyle = fx.extra.player.htmlRgb;
			var z = camera.zoom;
			if (!start || !end || !fx.extra.isLocalPlayer) {
				defaultFx(fx, ctx, time);
			} else {
				ctx.beginPath();
				line(start[0], start[1], end[0], end[1], (x, y) => {
					ctx.rect((x - camera.x) * camera.zoom, (y - camera.y) * camera.zoom, camera.zoom, camera.zoom);
				});
				ctx.stroke();
			}
		});
		function tick() {
			for (var painted = 0; painted < 3 && queue.length; painted++) {
				var current = queue.pop();
				var c = misc.world.getPixel(current[0], current[1]);
				var pc = player.selectedColor;
				if ((c[0] != pc[0] || c[1] != pc[1] || c[2] != pc[2]) && !misc.world.setPixel(current[0], current[1], player.selectedColor)) {
					queue.push(current);
					break;
				}
			}
			if (!queue.length) {
				start = null;
				end = null;
				tool.setEvent('tick', null);
				return;
			}
		}
		tool.setEvent('mousedown', mouse => {
			if (!(mouse.buttons & 0b100)) {
				queue = [];
				tool.setEvent('tick', null);
				start = [mouse.tileX, mouse.tileY];
				end = [mouse.tileX, mouse.tileY];
			}
		});
		tool.setEvent('mousemove', mouse => {
			if (!queue.length) {
				end = [mouse.tileX, mouse.tileY];
			}
		});
		tool.setEvent('mouseup', mouse => {
			if (!(mouse.buttons & 0b11) && !queue.length) {
				end = [mouse.tileX, mouse.tileY];
				if (!start) {
					end = null;
					return;
				}
				if (player.rank == RANK.ADMIN) {
					line(start[0], start[1], end[0], end[1], (x, y) => {
						misc.world.setPixel(x, y, player.selectedColor);
					});
					start = null;
					end = null;
				} else {
					line(start[0], start[1], end[0], end[1], (x, y) => {
						queue.push([x, y]);
					});
					tool.setEvent('tick', tick);
				}
			}
		});
		tool.setEvent('deselect', mouse => {
			queue = [];
			start = null;
			end = null;
			tool.setEvent('tick', null);
		});
	}));

	addTool(new Tool('Protect', cursors.shield, PLAYERFX.RECT_SELECT_ALIGNED(16, "#000000"), RANK.MODERATOR, tool => {
		tool.setFxRenderer((fx, ctx, time) => {
			var x = fx.extra.player.x;
			var y = fx.extra.player.y;
			var fxx = (Math.floor(x / 256) * 16 - camera.x) * camera.zoom;
			var fxy = (Math.floor(y / 256) * 16 - camera.y) * camera.zoom;
			ctx.globalAlpha = 0.5;
			var chunkX = Math.floor(fx.extra.player.tileX / protocol.chunkSize);
			var chunkY = Math.floor(fx.extra.player.tileY / protocol.chunkSize);
			var chunk = misc.world.getChunkAt(chunkX, chunkY);
			if (chunk) {
				ctx.fillStyle = chunk.locked ? "#00FF00" : "#FF0000";
				ctx.fillRect(fxx, fxy, camera.zoom * 16, camera.zoom * 16);
			}
			return 1; /* Rendering finished (won't change on next frame) */
		});
		tool.setEvent('mousedown mousemove', mouse => {
			var chunkX = Math.floor(mouse.tileX / protocol.chunkSize);
			var chunkY = Math.floor(mouse.tileY / protocol.chunkSize);
			var chunk = misc.world.getChunkAt(chunkX, chunkY);
			switch (mouse.buttons) {
				case 0b1:
					if (!chunk.locked) {
						net.protocol.protectChunk(chunkX, chunkY, 1);
					}
					break;

				case 0b10:
					if (chunk.locked) {
						net.protocol.protectChunk(chunkX, chunkY, 0);
					}
					break;
			}
		});
	}));

	addTool(new Tool('Area Protect', cursors.selectprotect, PLAYERFX.NONE, RANK.MODERATOR,
		tool => {
			tool.setFxRenderer((fx, ctx, time) => {
				if (!fx.extra.isLocalPlayer) return 1;
				var x = fx.extra.player.x;
				var y = fx.extra.player.y;
				var fxx = (Math.round(x / 256) * protocol.chunkSize - camera.x) * camera.zoom;
				var fxy = (Math.round(y / 256) * protocol.chunkSize - camera.y) * camera.zoom;
				var oldlinew = ctx.lineWidth;
				ctx.lineWidth = 1;
				if (tool.extra.end) {
					var s = tool.extra.start;
					var e = tool.extra.end;
					var x = (s[0] * protocol.chunkSize - camera.x) * camera.zoom + 0.5;
					var y = (s[1] * protocol.chunkSize - camera.y) * camera.zoom + 0.5;
					var rw = (e[0] - s[0]);
					var rh = (e[1] - s[1]);
					var w = rw * camera.zoom * protocol.chunkSize;
					var h = rh * camera.zoom * protocol.chunkSize;
					ctx.beginPath();
					ctx.rect(x, y, w, h);
					ctx.globalAlpha = 1;
					ctx.strokeStyle = "#FFFFFF";
					ctx.stroke();
					ctx.setLineDash([3, 4]);
					ctx.strokeStyle = "#000000";
					ctx.stroke();
					if (tool.extra.isSure) {
						ctx.globalAlpha = 0.6;
						ctx.fillStyle = "#00EE00";
						ctx.fill();
					}
					ctx.globalAlpha = 0.25 + Math.sin(time / 500) / 4;
					ctx.fillStyle = renderer.patterns.unloaded;
					ctx.fill();
					ctx.setLineDash([]);
					var oldfont = ctx.font;
					ctx.font = "16px sans-serif";
					var txt = `${tool.extra.isSure ? "Click again to confirm. " : (!tool.extra.clicking ? "Left/Right click to add/remove protection, respectively. " : "")}(${Math.abs(rw)}x${Math.abs(rh)})`;
					var txtx = window.innerWidth >> 1;
					var txty = window.innerHeight >> 1;
					txtx = Math.max(x, Math.min(txtx, x + w));
					txty = Math.max(y, Math.min(txty, y + h));

					drawText(ctx, txt, txtx, txty, true);
					ctx.font = oldfont;
					ctx.lineWidth = oldlinew;
					return 0;
				} else {
					ctx.beginPath();
					ctx.moveTo(0, fxy + 0.5);
					ctx.lineTo(window.innerWidth, fxy + 0.5);
					ctx.moveTo(fxx + 0.5, 0);
					ctx.lineTo(fxx + 0.5, window.innerHeight);

					//ctx.lineWidth = 1;
					ctx.globalAlpha = 1;
					ctx.strokeStyle = "#FFFFFF";
					ctx.stroke();
					ctx.setLineDash([3]);
					ctx.strokeStyle = "#000000";
					ctx.stroke();

					ctx.setLineDash([]);
					ctx.lineWidth = oldlinew;
					return 1;
				}
			});

			tool.extra.start = null;
			tool.extra.end = null;
			tool.extra.clicking = false;
			tool.extra.isSure = false;

			var timeout = null;

			const sure = () => {
				if (tool.extra.isSure) {
					clearTimeout(timeout);
					timeout = null;
					tool.extra.isSure = false;
					return true;
				}
				tool.extra.isSure = true;
				setTimeout(() => {
					tool.extra.isSure = false;
					timeout = null;
				}, 1000);
				return false;
			};

			tool.setEvent('mousedown', (mouse, event) => {
				var get = {
					rx() { return mouse.tileX / protocol.chunkSize; },
					ry() { return mouse.tileY / protocol.chunkSize },
					x() { return Math.round(mouse.tileX / protocol.chunkSize); },
					y() { return Math.round(mouse.tileY / protocol.chunkSize); }
				};
				var s = tool.extra.start;
				var e = tool.extra.end;
				const isInside = () => get.rx() >= s[0] && get.rx() < e[0] && get.ry() >= s[1] && get.ry() < e[1];
				const isChunkSolid = chunk => {
					var lastClr = chunk.get(0, 0);
					return chunk.forEach((x, y, clr) => clr === lastClr);
				};

				if (mouse.buttons === 1 && !tool.extra.end) {
					tool.extra.start = [get.x(), get.y()];
					tool.extra.clicking = true;
					tool.setEvent('mousemove', (mouse, event) => {
						if (tool.extra.start && mouse.buttons === 1) {
							tool.extra.end = [get.x(), get.y()];
							return 1;
						}
					});
					const finish = () => {
						tool.setEvent('mousemove mouseup deselect', null);
						tool.extra.clicking = false;
						var s = tool.extra.start;
						var e = tool.extra.end;
						if (e) {
							if (s[0] === e[0] || s[1] === e[1]) {
								tool.extra.start = null;
								tool.extra.end = null;
							}
							if (s[0] > e[0]) {
								var tmp = e[0];
								e[0] = s[0];
								s[0] = tmp;
							}
							if (s[1] > e[1]) {
								var tmp = e[1];
								e[1] = s[1];
								s[1] = tmp;
							}
						}
						renderer.render(renderer.rendertype.FX);
					};
					tool.setEvent('deselect', finish);
					tool.setEvent('mouseup', (mouse, event) => {
						if (!(mouse.buttons & 1)) {
							finish();
						}
					});
				} else if (mouse.buttons === 1 && tool.extra.end) {
					if (isInside() && sure()) {
						tool.extra.start = null;
						tool.extra.end = null;
						var [x, y, w, h] = [s[0], s[1], e[0] - s[0], e[1] - s[1]];
						for (var i = x; i < x + w; i++) {
							for (var j = y; j < y + h; j++) {
								var chunk = misc.world.getChunkAt(i, j);
								if (chunk && !chunk.locked) {
									if (keysDown[17] && isChunkSolid(chunk)) {
										continue;
									}
									net.protocol.protectChunk(i, j, 1);
								}
							}
						}
					} else if (!isInside()) {
						tool.extra.start = null;
						tool.extra.end = null;
					}
				} else if (mouse.buttons === 2 && tool.extra.end && isInside() && sure()) {
					tool.extra.start = null;
					tool.extra.end = null;
					var [x, y, w, h] = [s[0], s[1], e[0] - s[0], e[1] - s[1]];
					for (var i = x; i < x + w; i++) {
						for (var j = y; j < y + h; j++) {
							var chunk = misc.world.getChunkAt(i, j);
							if (chunk && chunk.locked) {
								if (keysDown[17] && !isChunkSolid(chunk)) {
									continue;
								}
								net.protocol.protectChunk(i, j, 0);
							}
						}
					}
				}
			});
		}
	));

	/*addTool(new Tool('Area Delete', cursors.selectprotect, PLAYERFX.NONE, RANK.MODERATOR,
		tool => {
			tool.setFxRenderer((fx, ctx, time) => {
				if (!fx.extra.isLocalPlayer) return 1;
				var x = fx.extra.player.x;
				var y = fx.extra.player.y;
				var fxx = (Math.round(x / 256) * protocol.chunkSize - camera.x) * camera.zoom;
				var fxy = (Math.round(y / 256) * protocol.chunkSize - camera.y) * camera.zoom;
				var oldlinew = ctx.lineWidth;
				ctx.lineWidth = 1;
				if (tool.extra.end) {
					var s = tool.extra.start;
					var e = tool.extra.end;
					var x = (s[0] * protocol.chunkSize - camera.x) * camera.zoom + 0.5;
					var y = (s[1] * protocol.chunkSize - camera.y) * camera.zoom + 0.5;
					var rw = (e[0] - s[0]);
					var rh = (e[1] - s[1]);
					var w = rw * camera.zoom * protocol.chunkSize;
					var h = rh * camera.zoom * protocol.chunkSize;
					ctx.beginPath();
					ctx.rect(x, y, w, h);
					ctx.globalAlpha = 1;
					ctx.strokeStyle = "#FFFFFF";
					ctx.stroke();
					ctx.setLineDash([3, 4]);
					ctx.strokeStyle = "#000000";
					ctx.stroke();
					if (tool.extra.isSure) {
						ctx.globalAlpha = 0.6;
						ctx.fillStyle = "#00EE00";
						ctx.fill();
					}
					ctx.globalAlpha = 0.25 + Math.sin(time / 500) / 4;
					ctx.fillStyle = renderer.patterns.unloaded;
					ctx.fill();
					ctx.setLineDash([]);
					var oldfont = ctx.font;
					ctx.font = "16px sans-serif";
					var txt = `${tool.extra.isSure ? "Click again to confirm. " : (!tool.extra.clicking ? "Double click to delete. " : "")}(${Math.abs(rw)}x${Math.abs(rh)})`;
					var txtx = window.innerWidth >> 1;
					var txty = window.innerHeight >> 1;
					txtx = Math.max(x, Math.min(txtx, x + w));
					txty = Math.max(y, Math.min(txty, y + h));

					drawText(ctx, txt, txtx, txty, true);
					ctx.font = oldfont;
					ctx.lineWidth = oldlinew;
					return 0;
				} else {
					ctx.beginPath();
					ctx.moveTo(0, fxy + 0.5);
					ctx.lineTo(window.innerWidth, fxy + 0.5);
					ctx.moveTo(fxx + 0.5, 0);
					ctx.lineTo(fxx + 0.5, window.innerHeight);

					//ctx.lineWidth = 1;
					ctx.globalAlpha = 1;
					ctx.strokeStyle = "#FFFFFF";
					ctx.stroke();
					ctx.setLineDash([3]);
					ctx.strokeStyle = "#000000";
					ctx.stroke();

					ctx.setLineDash([]);
					ctx.lineWidth = oldlinew;
					return 1;
				}
			});

			tool.extra.start = null;
			tool.extra.end = null;
			tool.extra.clicking = false;
			tool.extra.isSure = false;

			var timeout = null;

			const sure = () => {
				if (tool.extra.isSure) {
					clearTimeout(timeout);
					timeout = null;
					tool.extra.isSure = false;
					return true;
				}
				tool.extra.isSure = true;
				setTimeout(() => {
					tool.extra.isSure = false;
					timeout = null;
				}, 1000);
				return false;
			};

			tool.setEvent('mousedown', (mouse, event) => {
				var get = {
					rx() { return mouse.tileX / protocol.chunkSize; },
					ry() { return mouse.tileY / protocol.chunkSize },
					x() { return Math.round(mouse.tileX / protocol.chunkSize); },
					y() { return Math.round(mouse.tileY / protocol.chunkSize); }
				};
				var s = tool.extra.start;
				var e = tool.extra.end;
				const isInside = () => get.rx() >= s[0] && get.rx() < e[0] && get.ry() >= s[1] && get.ry() < e[1];
				if (mouse.buttons === 1 && !tool.extra.end) {
					tool.extra.start = [get.x(), get.y()];
					tool.extra.clicking = true;
					tool.setEvent('mousemove', (mouse, event) => {
						if (tool.extra.start && mouse.buttons === 1) {
							tool.extra.end = [get.x(), get.y()];
							return 1;
						}
					});
					const finish = () => {
						tool.setEvent('mousemove mouseup deselect', null);
						tool.extra.clicking = false;
						var s = tool.extra.start;
						var e = tool.extra.end;
						if (e) {
							if (s[0] === e[0] || s[1] === e[1]) {
								tool.extra.start = null;
								tool.extra.end = null;
							}
							if (s[0] > e[0]) {
								var tmp = e[0];
								e[0] = s[0];
								s[0] = tmp;
							}
							if (s[1] > e[1]) {
								var tmp = e[1];
								e[1] = s[1];
								s[1] = tmp;
							}
						}
						renderer.render(renderer.rendertype.FX);
					};
					tool.setEvent('deselect', finish);
					tool.setEvent('mouseup', (mouse, event) => {
						if (!(mouse.buttons & 1)) {
							finish();
						}
					});
				} else if (mouse.buttons === 1 && tool.extra.end) {
					if (isInside() && sure()) {
						tool.extra.start = null;
						tool.extra.end = null;
						var [x, y, w, h] = [s[0], s[1], e[0] - s[0], e[1] - s[1]];
						for (var i = x; i < x + w; i++) {
							for (var j = y; j < y + h; j++) {
								var chunk = misc.world.getChunkAt(i, j);
								if (chunk && !chunk.locked) {
									net.protocol.clearChunk(i, j, [255, 255, 255]);
								}
							}
						}
					} else if (!isInside()) {
						tool.extra.start = null;
						tool.extra.end = null;
					}
				} else if (mouse.buttons === 2 && tool.extra.end && isInside() && sure()) {
					tool.extra.start = null;
					tool.extra.end = null;
					var [x, y, w, h] = [s[0], s[1], e[0] - s[0], e[1] - s[1]];
					for (var i = x; i < x + w; i++) {
						for (var j = y; j < y + h; j++) {
							var chunk = misc.world.getChunkAt(i, j);
							if (chunk && chunk.locked) {
								net.protocol.clearChunk(i, j, [255, 255, 255]);
							}
						}
					}
				}
			});
		}
	));*/

	addTool(new Tool('Paste', cursors.paste, PLAYERFX.NONE, RANK.MODERATOR, tool => {
		tool.extra.sendQueue = [];

		tool.setFxRenderer((fx, ctx, time) => {
			var z = camera.zoom;
			var x = fx.extra.player.x;
			var y = fx.extra.player.y;
			var fxx = Math.floor(x / 16) - camera.x;
			var fxy = Math.floor(y / 16) - camera.y;

			var q = tool.extra.sendQueue;
			if (q.length) {
				var cs = protocol.chunkSize;
				ctx.strokeStyle = "#000000";
				ctx.globalAlpha = 0.8;
				ctx.beginPath();
				for (var i = 0; i < q.length; i++) {
					ctx.rect((q[i].x * cs - camera.x) * z, (q[i].y * cs - camera.y) * z, z * cs, z * cs);
				}
				ctx.stroke();
				return 0;
			}

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
						if (!net.protocol.setChunk(x, y, newChunk)) {
							var nbuf = new Uint32Array(newChunk.length);
							nbuf.set(newChunk);
							tool.extra.sendQueue.push({
								x: x,
								y: y,
								buf: nbuf
							});
						}
					}
				}
			}
		}

		tool.setEvent('tick', () => {
			var q = tool.extra.sendQueue;
			if (q.length) {
				if (net.protocol.setChunk(q[0].x, q[0].y, q[0].buf)) {
					q.shift();
				}
			}
		});

		tool.setEvent('mousedown', mouse => {
			if (mouse.buttons & 0b1) {
				if (tool.extra.canvas) {
					if (tool.extra.sendQueue.length) {
						throw new Error("Wait until pasting finishes, or cancel with right click!");
					}
					
					paint(mouse.tileX, mouse.tileY);
				}
			} else if (mouse.buttons & 0b10) {
				tool.extra.sendQueue = [];
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

	addTool(new Tool('Copy', cursors.copy, PLAYERFX.NONE, RANK.MODERATOR, function (tool) {
		function drawText(ctx, str, x, y, centered) {
			ctx.strokeStyle = "#000000", ctx.fillStyle = "#FFFFFF", ctx.lineWidth = 2.5, ctx.globalAlpha = 0.5;
			if (centered) {
				x -= ctx.measureText(str).width >> 1;
			}
			ctx.strokeText(str, x, y);
			ctx.globalAlpha = 1;
			ctx.fillText(str, x, y);
		}

		tool.setFxRenderer(function (fx, ctx, time) {
			if (!fx.extra.isLocalPlayer) return 1;
			var x = fx.extra.player.x;
			var y = fx.extra.player.y;
			var fxx = (Math.floor(x / 16) - camera.x) * camera.zoom;
			var fxy = (Math.floor(y / 16) - camera.y) * camera.zoom;
			var oldlinew = ctx.lineWidth;
			ctx.lineWidth = 1;
			if (tool.extra.end) {
				var s = tool.extra.start;
				var e = tool.extra.end;
				var x = (s[0] - camera.x) * camera.zoom + 0.5;
				var y = (s[1] - camera.y) * camera.zoom + 0.5;
				var w = e[0] - s[0];
				var h = e[1] - s[1];
				ctx.beginPath();
				ctx.rect(x, y, w * camera.zoom, h * camera.zoom);
				ctx.globalAlpha = 1;
				ctx.strokeStyle = "#FFFFFF";
				ctx.stroke();
				ctx.setLineDash([3, 4]);
				ctx.strokeStyle = "#000000";
				ctx.stroke();
				ctx.globalAlpha = 0.25 + Math.sin(time / 500) / 4;
				ctx.fillStyle = renderer.patterns.unloaded;
				ctx.fill();
				ctx.setLineDash([]);
				var oldfont = ctx.font;
				ctx.font = "16px sans-serif";
				var txt = (!tool.extra.clicking ? "Right click to copy " : "") + '(' + Math.abs(w) + 'x' + Math.abs(h) + ')';
				var txtx = window.innerWidth >> 1;
				var txty = window.innerHeight >> 1;
				txtx = Math.max(x, Math.min(txtx, x + w * camera.zoom));
				txty = Math.max(y, Math.min(txty, y + h * camera.zoom));

				drawText(ctx, txt, txtx, txty, true);
				ctx.font = oldfont;
				ctx.lineWidth = oldlinew;
				return 0;
			} else {
				ctx.beginPath();
				ctx.moveTo(0, fxy + 0.5);
				ctx.lineTo(window.innerWidth, fxy + 0.5);
				ctx.moveTo(fxx + 0.5, 0);
				ctx.lineTo(fxx + 0.5, window.innerHeight);

				//ctx.lineWidth = 1;
				ctx.globalAlpha = 1;
				ctx.strokeStyle = "#FFFFFF";
				ctx.stroke();
				ctx.setLineDash([3]);
				ctx.strokeStyle = "#000000";
				ctx.stroke();

				ctx.setLineDash([]);
				ctx.lineWidth = oldlinew;
				return 1;
			}
		});

		tool.extra.start = null;
		tool.extra.end = null;
		tool.extra.clicking = false;

		tool.setEvent('mousedown', function (mouse, event) {
			var s = tool.extra.start;
			var e = tool.extra.end;
			var isInside = function isInside() {
				return mouse.tileX >= s[0] && mouse.tileX < e[0] && mouse.tileY >= s[1] && mouse.tileY < e[1];
			};
			if (mouse.buttons === 1 && !tool.extra.end) {
				tool.extra.start = [mouse.tileX, mouse.tileY];
				tool.extra.clicking = true;
				tool.setEvent('mousemove', function (mouse, event) {
					if (tool.extra.start && mouse.buttons === 1) {
						tool.extra.end = [mouse.tileX, mouse.tileY];
						return 1;
					}
				});
				var finish = function finish() {
					tool.setEvent('mousemove mouseup deselect', null);
					tool.extra.clicking = false;
					var s = tool.extra.start;
					var e = tool.extra.end;
					if (e) {
						if (s[0] === e[0] || s[1] === e[1]) {
							tool.extra.start = null;
							tool.extra.end = null;
						}
						if (s[0] > e[0]) {
							var tmp = e[0];
							e[0] = s[0];
							s[0] = tmp;
						}
						if (s[1] > e[1]) {
							var tmp = e[1];
							e[1] = s[1];
							s[1] = tmp;
						}
					}
					renderer.render(renderer.rendertype.FX);
				};
				tool.setEvent('deselect', finish);
				tool.setEvent('mouseup', function (mouse, event) {
					if (!(mouse.buttons & 1)) {
						finish();
					}
				});
			} else if (mouse.buttons === 1 && tool.extra.end) {
				if (isInside()) {
					var offx = mouse.tileX;
					var offy = mouse.tileY;
					tool.setEvent('mousemove', function (mouse, event) {
						var dx = mouse.tileX - offx;
						var dy = mouse.tileY - offy;
						tool.extra.start = [s[0] + dx, s[1] + dy];
						tool.extra.end = [e[0] + dx, e[1] + dy];
					});
					var end = function end() {
					   tool.setEvent('mouseup deselect mousemove', null);
					};
					tool.setEvent('deselect', end);
					tool.setEvent('mouseup', function (mouse, event) {
						if (!(mouse.buttons & 1)) {
							end();
						}
					});
				} else {
					tool.extra.start = null;
					tool.extra.end = null;
				}
		   } else if (mouse.buttons === 2 && tool.extra.end && isInside()) {
				tool.extra.start = null;
				tool.extra.end = null;
				var x = s[0];
				var y = s[1];
				var w = e[0] - s[0];
				var h = e[1] - s[1];
				var c = document.createElement('canvas');
				c.width = w;
				c.height = h;
				var ctx = c.getContext('2d');
				var d = ctx.createImageData(w, h);
				for (var i = y; i < y + h; i++) {
					for (var j = x; j < x + w; j++) {
						var pix = misc.world.getPixel(j, i);
						if (!pix) continue;
						d.data[4 * ((i - y) * w + (j - x))] = pix[0];
						d.data[4 * ((i - y) * w + (j - x)) + 1] = pix[1];
						d.data[4 * ((i - y) * w + (j - x)) + 2] = pix[2];
						d.data[4 * ((i - y) * w + (j - x)) + 3] = 255;
					}
				}
				ctx.putImageData(d, 0, 0);
				var paste = tools.paste;
				paste.extra.canvas = c;
				var oldSelect = paste.events.select;
				paste.events.select = function() {
					paste.events.select = oldSelect;
				};
				player.tool = "paste";
			}
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
