'use strict';
import { Lerp } from './util/Lerp.js';
import { colorUtils as color } from './util/color.js';
import { misc, playerList, playerListTable } from './main.js';
import { Fx, PLAYERFX } from './Fx.js';
import { tools } from './tools.js';

export class Player {
    constructor(x, y, rgb, tool, id) {
        this.id = id.toString(); /* Prevents calling .toString every frame */
        this._x = new Lerp(x, x, 65);
        this._y = new Lerp(y, y, 65);

        this.tool = tools[tool] || tools['cursor'];
        this.fx = new Fx(tool ? tool.fxType : PLAYERFX.NONE, { player: this });
        this.fx.setVisible(misc.world.validMousePos(
            Math.floor(this.endX / 16), Math.floor(this.endY / 16)));

        this.rgb = rgb;
        this.htmlRgb = color.toHTML(color.u24_888(rgb[0], rgb[1], rgb[2]));

        this.clr = (((id + 75387) * 67283 + 53143) % 256) << 16
                 | (((id + 9283)  * 4673  + 7483)  % 256) << 8
                 | (  id * 3000                    % 256);
        this.clr = color.toHTML(this.clr);

		var playerListEntry = document.createElement("tr");
		playerListEntry.innerHTML = "<td>" + this.id + "</td><td>" + Math.floor(x / 16) + "</td><td>" + Math.floor(y / 16) + "</td>";
		playerList[this.id] = playerListEntry;
		playerListTable.appendChild(playerListEntry);
	}
	
	get tileX() {
		return Math.floor(this.x / 16);
	}

	get tileY() {
		return Math.floor(this.y / 16);
	}

    get endX() {
        return this._x.end;
    }

    get endY() {
        return this._y.end;
    }

    get x() {
        return this._x.val;
    }

    get y() {
        return this._y.val;
    }

    update(x, y, rgb, tool) {
        this._x.val = x;
        this._y.val = y;
        /* TODO: fix weird bug (caused by connecting before tools initialized?) */
        //console.log(tool)
        this.tool = tools[tool] || tools['cursor'];
        this.fx.setRenderer((this.tool || {}).fxRenderer ); // temp until fix: || {}
        this.fx.setVisible(misc.world.validMousePos(
            Math.floor(this.endX / 16), Math.floor(this.endY / 16)));
        this.rgb = rgb;
        this.htmlRgb = color.toHTML(color.u24_888(rgb[0], rgb[1], rgb[2]));

		playerList[this.id].childNodes[1].innerHTML = Math.floor(x / 16);
		playerList[this.id].childNodes[2].innerHTML = Math.floor(y / 16);
    }

    disconnect() {
        this.fx.delete();

		playerListTable.removeChild(playerList[this.id]);
		delete playerList[this.id];
    }
}
