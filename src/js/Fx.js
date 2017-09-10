"use strict";
import { colorUtils as color } from './util/color.js';
import { EVENTS as e, protocol } from './conf.js';
import { getTime } from './util/misc.js';
import { eventSys, PublicAPI } from './global.js';
import { camera, renderer } from './canvas_renderer.js';

export const FXTYPE = {
	NONE: -1,
	PIXEL_SELECT: 0,
	PIXEL_UPDATE: 1,
	CHUNK_UPDATE: 3
};

export const activeFx = [];

PublicAPI.activeFx = activeFx;

export class Fx {
    constructor(type, x, y, options) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.options = options;
        var clr = options.color;
        if (Number.isInteger(clr)) {
            this.options.colorhex = color.toHTML(clr);
		}
		activeFx.push(this);
	}
	
	update(type, x, y, options) {
		this.type = type;
		this.x = x;
		this.y = y;
		if(!Number.isInteger(options.color)) {
			options.colorhex = "#000000";
		} else if(options.color !== this.options.color) {
			options.colorhex = color.toHTML(options.color);
		} else { /* if same color */
			return;
		}
		this.options = options;
	}

	delete() {
		var i = activeFx.indexOf(this);
		if(i !== -1) {
			activeFx.splice(i, 1);
		}
	}
}

eventSys.on(e.net.world.tilesUpdated, tiles => {
	let time = getTime(true);
	let made = false;
	for (var i = 0; i < tiles.length; i++) {
		var t = tiles[i];
		if (camera.isVisible(t.x, t.y, 1, 1)) {
			new Fx(FXTYPE.PIXEL_UPDATE, t.x, t.y, {color: t.rgb ^ 0xFFFFFF, time: time});
			made = true;
		}
	}
	if (made) {
		renderer.render(renderer.rendertype.FX);
	}
});

eventSys.on(e.net.chunk.clear, (chunkX, chunkY) => {
	new Fx(FXTYPE.CHUNK_UPDATE, chunkX * protocol.chunkSize, chunkY * protocol.chunkSize, {time: getTime(true)});
	renderer.render(renderer.rendertype.FX);
})