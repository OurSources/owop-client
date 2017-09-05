'use strict';
import { Lerp } from './util/Lerp.js';
import { colorUtils as color } from './util/color.js';

class Player {
    constructor(x, y, rgb, tool, id) {
        this.id   = id.toString(); /* Prevents calling .toString every frame */
        this._x    = new Lerp(x, x, 50);
        this._y    = new Lerp(y, y, 50);
        this.tool = tool;

        this.clr = (((id + 75387) * 67283 + 53143) % 256) << 16
                 | (((id + 9283)  * 4673  + 7483)  % 256) << 8
                 | (  id * 3000                    % 256);
        this.clr = color.toHTML(this.clr);
    
        this.rgb    = rgb;
    
        var fl = Math.floor;
        var toolfx = null; /* TODO */
        toolfx = toolfx ? toolfx.fxType : -1;
        /* TODO: Lerp Fx position */
        this.fx = new Fx(toolfx, fl(x / 16), fl(y / 16), {color: this.rgb});
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

    update(x, y, rgb, tool, t) {
        this._x = x;
        this._y = y;
        this.tool = tool;
        this.rgb = rgb;
        let toolfx = -1;
        this.fx.update(toolfx, fl(x / 16), fl(y / 16), {color: this.rgb});
    }

    disconnect() {
        this.fx.delete();
    }
}
