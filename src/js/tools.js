'use strict';
import { PublicAPI, eventSys } from './global.js';
import { EVENTS as e } from './conf.js';
import { cursors } from './tool_renderer.js';

export const tools = {};

PublicAPI.tools = tools;

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

eventSys.once(e.misc.toolsRendered, function() {
	// Cursor tool
	tools['cursor'] = new Tool(cursors.cursor, 0, false,
		function(tool) {
			function draw(tileX, tileY, color) {
				var pixel = misc.world.getPixel(tileX, tileY);
				if (pixel !== null && !(color[0] === pixel[0] && color[1] === pixel[1] && color[2] === pixel[2])) {
					wop.undoHistory.push([tileX, tileY, pixel]);
					wop.net.updatePixel(tileX, tileY, color);
				}
			}
			
			tool.setEvent('click', function(x, y, buttons, isDrag) {
				var tileX = Math.floor(wop.camera.x + (x / wop.camera.zoom));
				var tileY = Math.floor(wop.camera.y + (y / wop.camera.zoom));
				/* White color if right clicking */
				var color = buttons == 2 ? [255, 255, 255] : wop.palette[wop.paletteIndex];
				switch (buttons) {
				case 1:
				case 2:
					draw(tileX, tileY, color);
					break;
				case 4:
					wop.addPaletteColor(pixel);
					break;
				}
			});
		}.bind(this)
	);
	
	// Move tool
	tools['move'] = new Tool(cursors.move, -1, false,
		function(tool) {
			var extra = tool.extra;
			var wop = this;
			function move(x, y, isDrag) {
				if (!isDrag) {
					extra.startX = wop.camera.x + (x / wop.camera.zoom);
					extra.startY = wop.camera.y + (y / wop.camera.zoom);
				} else {
					wop.camera.x = extra.startX - (x / wop.camera.zoom);
					wop.camera.y = extra.startY - (y / wop.camera.zoom);
					wop.updateCamera();
				}
			}
			tool.setEvent("click", function(x, y, buttons, isDrag) {
				move(x, y, isDrag);
			});
			tool.setEvent("touch", function(touches, type) {
				move(touches[0].pageX, touches[0].pageY, type !== 0);
			});
		}.bind(this)
	);
	
	// Pipette tool
	tools['pipette'] = new Tool(cursors.pipette, -1, false,
		function(tool) {
			var wop = this;
			tool.setEvent("click", function(x, y, buttons, isDrag) {
				var tileX = Math.floor(wop.camera.x + (x / wop.camera.zoom));
				var tileY = Math.floor(wop.camera.y + (y / wop.camera.zoom));
				
				var color = wop.getPixel(tileX, tileY);
				if (color) {
					wop.addPaletteColor(color);
				}
			});
		}.bind(this)
	);
	
	// Erase/Fill tool
	/*tools['erase'] = new Tool(cursors.fill, 3, true,
		function(x, y, buttons, isDrag) {
			var chunk16X = Math.floor((this.camera.x + (x / this.camera.zoom)) / 16);
			var chunk16Y = Math.floor((this.camera.y + (y / this.camera.zoom)) / 16);
			
			var fill = false;
			var fl = Math.floor;
			var chunk = this.chunks[[fl(chunk16X / 16), fl(chunk16Y / 16)]];
			var color = buttons == 2 ? [31, 63, 31] : this.palette[this.paletteIndex];
			if (!chunk || !this.net.isConnected()) {
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
			}
		}.bind(this)
	);
	
	// Zoom tool
	tools['zoom'] = new Tool(cursors.zoom, -1, false,
		function(x, y, buttons, isDrag, touches) {
			if (!isDrag) {
				var lzoom = this.camera.zoom;
				if (buttons === 1 && this.camera.zoom * (1 + this.options.zoomStrength) <= this.options.zoomLimitMax) {
					// Zoom in
					this.camera.zoom *= 1 + this.options.zoomStrength;
					this.camera.x += this.mouse.x / this.camera.zoom;
					this.camera.y += this.mouse.y / this.camera.zoom;
					this.updateCamera();
				} else if (buttons === 2 && this.camera.zoom / (1 + this.options.zoomStrength) >= this.options.zoomLimitMin) {
					// Zoom out
					this.camera.zoom /= 1 + this.options.zoomStrength;
					this.camera.x += this.mouse.x * (3 / lzoom - 2 / this.camera.zoom);
					this.camera.y += this.mouse.y * (3 / lzoom - 2 / this.camera.zoom);
					this.updateCamera();
				} else if (buttons === 3) {
					// Reset zoom (right + left click)
					this.camera.zoom = this.options.defaultZoom;
					this.updateCamera();
				}
				if (lzoom !== this.camera.zoom) {
					this.events.emit("zoom", this.camera.zoom);
				}
			}
		}.bind(this),
		function(touches, type) {
			var lzoom = this.camera.zoom;
			if (type === 0 && touches[0].identifier === 1 && this.camera.zoom / (1 + this.options.zoomStrength) >= this.options.zoomLimitMin) {
				// Zoom out
				this.camera.zoom /= 1 + this.options.zoomStrength;
				this.camera.x += this.mouse.x * (3 / lzoom - 2 / this.camera.zoom);
				this.camera.y += this.mouse.y * (3 / lzoom - 2 / this.camera.zoom);
				this.updateCamera();
			}
			if (lzoom !== this.camera.zoom) {
				this.events.emit("zoom", this.camera.zoom);
			}
		}.bind(this),
		function() {}
	);*/
	eventSys.emit(e.misc.toolsInitialized);
});