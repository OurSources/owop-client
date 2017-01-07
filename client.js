(function(){ /* This code is getting messy... */
if(window.location.hostname.indexOf("cursors.me") != -1 || window.location.hostname.indexOf("yourworldofpixels.com") != -1){
	window.location.href = "http://www.ourworldofpixels.com/";
	return;
}
window.requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
			window.webkitRequestAnimationFrame || window.msRequestAnimationFrame ||
			function(f){setTimeout(f, 1000/30);};
if(typeof Uint8Array === "undefined"){
	Uint8Array = Array;
}
if(typeof Uint8Array.prototype.join === "undefined"){
	/* Old browsers */
	Uint8Array.prototype.join = function(e){
		if(typeof e === "undefined"){
			e = ',';
		} else if(typeof e !== "string"){
			e = e.toString();
		}
		var str = "";
		var i = 0;
		do {
			str += this[i] + e;
		} while(++i < this.length - 1);
		return str + this[i];
	};
}
var canvas = null;
var ctx = null;

var t = 0;
var a = false;
var st = 0;
var nt = 0;
var dt = [Date.now() + 500, false];
var id = 0;
var fx = [];
var con = false;
var cur = [[new Image(), -1, -2], [new Image(), -18, -20], [new Image(), -1, -30], [new Image(), -7, -32]];
var rgb = [new Uint8Array([0, 0, 0]), new Uint8Array([255, 0, 0]), new Uint8Array([0, 255, 0]), new Uint8Array([0, 0, 255])];
var map = {};
var ppl = {};
var req = [];
var urls = ["https://www.paypal.me/InfraRaven", "https://www.reddit.com/r/OurWorldOfPixels/"];
var rgbn = 0;
var zoom = 1; /* TODO */
var camx = 0;
var camy = 0;
var tool = 0;
var tools = null;
var undos = [];
var count = 0;
var chnkx = 0;
var chnky = 0;
var pixlx = 0;
var pixly = 0;
var shift = false;
var cwarn = false;
var pbuckt = null;
var cbuckt = null;
var movthr = 0;
var moving = false;
var chnkmy = 0;
var mousex = 0;
var mousey = 0;
var sentmx = 0;
var sentmy = 0;
var senttl = 0;
var socket = null;
var cursorx = 0;
var cursory = 0;
var chatlog = [];
var chatstr = "";
var sentrgb = [0, 0, 0];
var visible = [];
var chatting = false;
var clicking = false;
var unloaded = new Image();
var dragnpaint = false;
var toolswindow = null;
var unloadedpat = null;

var wheel = new Image();
var drop = new Image();

/* not good at all */
var changetool = function(){};

window.windows = [];
window.currentaction = null;
window.textfocus = null;

document.addEventListener("keydown", function(e){
	if(textfocus && e.keyCode == 8){
		textfocus.onkeypress(e);
		e.preventDefault();
		e.stopPropagation();
		return false;
	} else if(e.keyCode == 8 && chatting && chatstr.length){
		chatstr = chatstr.slice(0, -1);
		keeprendering();
		e.preventDefault();
		e.stopPropagation();
		return false;
	} else if(e.keyCode == 37){
		camx += e.shiftKey ? 32 : 16;
		camx |= 0;
		updatevisible();
	} else if(e.keyCode == 38){
		camy += e.shiftKey ? 32 : 16;
		camy |= 0;
		updatevisible();
	} else if(e.keyCode == 39){
		camx -= e.shiftKey ? 32 : 16;
		camx |= 0;
		updatevisible();
	} else if(e.keyCode == 40){
		camy -= e.shiftKey ? 32 : 16;
		camy |= 0;
		updatevisible();
	}
	if(e.shiftKey){
		changetool(1);
	}
	shift = e.shiftKey;
	keeprendering();
});

document.addEventListener("keyup", function(e){
	if(!e.shiftKey && tool == 1){
		changetool(0);
		keeprendering();
	}
	shift = e.shiftKey;
});

cur[0][0].src = "/cursor.png";
cur[1][0].src = "/move.png";
cur[2][0].src = "/pipette.png";
cur[3][0].src = "/erase.png";
unloaded.src = "/unloaded.png";
drop.src = "/drop.png";
wheel.src = "/wheel.png";
unloaded.onload = function(){
	var tmp = document.createElement("canvas");
	var c = tmp.getContext("2d");
	unloadedpat = c.createPattern(unloaded, "repeat");
};

function hashFnv32a(str, asString, seed) {
    /*jshint bitwise:false */
    var i, l,
        hval = (seed === undefined) ? 0x811c9dc5 : seed;

    for (i = 0, l = str.length; i < l; i++) {
        hval ^= str.charCodeAt(i);
        hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
    }
    if( asString ){
        // Convert to 8 digit hex string
        return ("0000000" + (hval >>> 0).toString(16)).substr(-8);
    }
    return hval >>> 0;
}

function Bucket(a, p){
	this.allowance = a;
	this.per = p;
	this.rate = a;
	this.lastcheck = 0;
}

Bucket.prototype.canspend = function(count){
	var passed = (nt - this.lastcheck) / 1000;
	this.lastcheck = nt;
	this.allowance += passed * (this.rate / this.per);
	if(this.allowance > this.rate)
		this.allowance = this.rate;
	if(this.allowance < count)
		return false;
	this.allowance -= count;
	return true;
}

function Cursor(x, y, r, g, b, tool, id) {
    this.x = this.nx = x;
    this.y = this.ny = y;
    this.r = r;
    this.g = g;
    this.b = b;
    this.tool = tool;
    this.t = nt;
    this.clr = hashFnv32a(Math.pow(id, 2).toString(), true).slice(2);
}

Cursor.prototype.getX = function(){
	var inc = (nt - this.t) / 100;
	return this.x + (inc >= 1 ? 1 : inc) * (this.nx - this.x);
};

Cursor.prototype.getY = function(){
	var inc = (nt - this.t) / 100;
	return this.y + (inc >= 1 ? 1 : inc) * (this.ny - this.y);
};

Cursor.prototype.update = function(x, y, r, g, b, tool){
	this.x = this.nx;
	this.y = this.ny;
	this.nx = x;
	this.ny = y;
	this.r = r;
	this.g = g;
	this.b = b;
	this.tool = tool;
	this.t = nt;
};

function resize(){
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	for(var i = windows.length; i--;){
		if(windows[i].x + windows[i].w > canvas.width){
			windows[i].x = canvas.width - windows[i].w;
		}
		if(windows[i].y + windows[i].h > canvas.height){
			windows[i].y = canvas.height - windows[i].h;
		}
	}
	ctx.font = "14px sans-serif";
	updatevisible();
}

function islocked(){
	return canvas === document.pointerLockElement;
}

function isvisible(x, y, w, h){
	return x + w >= ~camx && x <= ~camx + canvas.width
		&& y + h >= ~camy && y <= ~camy + canvas.height;
}

function keeprendering(){
	var nt = Date.now();
	if(nt - t >= 2500){
		t = nt;
		window.requestAnimationFrame(render);
		return;
	}
	t = nt;
}

function findrgb(nrgb){
	for(var i = rgb.length; i--;){
		if(rgb[i][0] == nrgb[0] && rgb[i][1] == nrgb[1] && rgb[i][2] == nrgb[2]){
			return i;
		}
	}
	return -1;
}

function dropdet(){
	var x = mousex - ((canvas.width >> 1) - (drop.width >> 1));
	var btns = [[7, 1, 67, 64], [1, 71, 38, 35], [43, 71, 38, 35]];
	for(var i = btns.length; i--;){
		if(x >= btns[i][0] && mousey >= btns[i][1] && x <= btns[i][0] + btns[i][2] && mousey <= btns[i][1] + btns[i][3]){
			return i + 5;
		}
	}
	if(x > 19 && mousey > 109 && x < 19 + 46 && mousey < 109 + 13) return 4;
	return 0;
}

function uibtndet(){
	/* just */
	return ((mousex >= canvas.width - 40) ? 2 : (mousex > canvas.width - 72 && mousex < canvas.width - 48 && mousey > (canvas.height >> 1) - 12 && mousey < (canvas.height >> 1) + 12) ? 3 : (nt - dt[0] >= 500 && !dt[1] && mousey <= 14 && mousex > (canvas.width >> 1) - (drop.width >> 1) && mousex < (canvas.width >> 1) - (drop.width >> 1) + drop.width) ? 4 : (nt - dt[0] >= 500 && dt[1] ? dropdet() : 0));
}

function mousemove(evt){
	var oldcx = camx;
	var oldcy = camy;
	var oldmx = mousex;
	var oldmy = mousey;
	if(clicking && !moving && tool == 1){
		movthr = 0;
		moving = [mousex, mousey];
	}
	mousex = evt.pageX;
	mousey = evt.pageY;
	if(currentaction){
		currentaction[1].onevent(currentaction[0], {mousex: mousex, mousey: mousey, lastx: oldmx, lasty: oldmy, extra: currentaction[2]});
	}
	if(clicking){
		++movthr;
		if(moving){
			camx -= moving[0] - mousex;
			camy -= moving[1] - mousey;
			moving = [mousex, mousey];
		}
	}
	camx |= 0;
	camy |= 0;
	chnkx = ~camx + mousex >> 8;
	chnky = ~camy + mousey >> 8;
	cursorx = ~camx + mousex;
	cursory = ~camy + mousey;
	pixlx = cursorx - (chnkx << 8) >> 4;
	pixly = cursory - (chnky << 8) >> 4;
	if(movthr < 8 && clicking && tool == 0 && uibtndet()){
		clicking = false;
	} else if(clicking && tool == 0 && evt.button != 1 && dragnpaint){
		put(evt.button);
	}
	if(oldcx != camx || oldcy != camy){
		updatevisible();
	} else {
		keeprendering();
	}
}

function mousedown(evt){
	textfocus = null;
	if(!uibtndet()){
		for(var x = windows.length; x--;){
			if(mousex > windows[x].x && mousey > windows[x].y
			   && mousex < windows[x].x + windows[x].w
			   && mousey < windows[x].y + windows[x].h){
				windows[x].click(mousex - windows[x].x, mousey - windows[x].y);
				if(x < windows.length - 1){
					/* bring to front */
					windows.push(windows.splice(x, 1)[0]);
				}
				return false;
			}
		}
	}
	clicking = true;
	return false;
}

function mouseup(evt){
	keeprendering();
	var b = uibtndet();
	if(movthr < 8 && b && !currentaction){
		switch(b){
			case 5:
				for(var i = windows.length; i--;){
					if(windows[i].title == "Help")
						windows.splice(i, 1);
				}
				var win = new GUIWindow((canvas.width >> 1) - 220, (canvas.height >> 1) - 101, 10, 10, "Help", true, false);
				win.addElement(new GUITextbox(0, 0, 0, 0, false, "Cursor tool controls:\n Left click paints with the selected color.\n Middle click picks the color your cursor points to.\n Right click erases the color.\n\nMisc tips:\n Hold shift and click to move through the map.\n Right click a color in the color bar to erase it.\n Press F to manually insert a color (RGB).\n Press CTRL + Z to undo the last change.\n Press Enter to chat.", true));
				win.addElement(new GUIToggle(0, 0, 0, 0, "Enable drag to draw", function(b){
					b.state = dragnpaint = !b.state;
					win.rerender = true;
					if(!b.state && window.localStorage){
						window.localStorage.dragNPaint = "0";
					} else if(b.state && window.localStorage){
						window.localStorage.dragNPaint = "1";
					}
				}, {state: dragnpaint}));
				windows.push(win);
				clicking = false;
				break;
			case 2:
				var hudy = (canvas.height >> 1) - 16;
				var my = mousey - hudy;
				var selc = -Math.floor(my / 40);
				if(rgbn + selc >= 0 && rgbn + selc < rgb.length){
					if(evt.button == 2 && rgb.length > 1){
						rgb.splice(rgbn + selc, 1);
						if(selc <= 0 && rgbn != 0) {
							--rgbn;
						}
					} else {
						rgbn += selc;
					}
					/* Ugly */
					clicking = false;
				}
				break;
			case 3:
				for(var i = windows.length; i--;){
					if(windows[i].title == "Pick a color")
						windows.splice(i, 1);
				}
				windows.push(UtilColorPicker(canvas.width - 264, (canvas.height>>1)-119, wheel, function(newrgb){
					var i = findrgb(newrgb);
					if(i == -1){
						rgb.unshift(new Uint8Array(newrgb));
						rgbn = 0;
					} else {
						rgbn = i;
					}
				}, rgb[rgbn]));
				clicking = false;
				break;
			case 4:
				dt = [nt, !dt[1]];
				clicking = false;
				break;

			case 6:
			case 7:
				window.open(urls[b - 6], '_newtab');
				clicking = false;
				break;
		}
	}
	if(clicking && movthr < 8 && [chnkx, chnky] in map && map[[chnkx, chnky]][1] && socket.readyState == socket.OPEN){
		put(evt.button);
	}
	clicking = false;
	moving = false;
	currentaction = null;
	movthr = 0;
	evt.preventDefault();
	evt.stopPropagation();
	return false;
}

function mousewheel(evt){
	var delta = Math.max(-1, Math.min(1, (evt.wheelDelta || -evt.detail)));
	if(nt - st > 100 && delta != -0){
		switch(delta){
			case -1:
				rgbn = rgbn - 1 < 0 ? rgb.length - 1 : rgbn - 1;
				break;
			case 1:
				rgbn = rgbn + 1 >= rgb.length ? 0 : rgbn + 1;
				break;
		}
		st = nt;
		keeprendering();
	}
	//zoom += delta / 100;
}

function put(btn){
	var ref = map[[chnkx, chnky]];
	if(socket.readyState != socket.OPEN || !ref) return;
	switch(tool){
		case 0:
			var paint = true;
			var sel = rgb[rgbn];
			switch(btn){
				case 1:
					var nrgb = new Uint8Array(
						[ref[0][(pixly * 16 + pixlx) * 3],
						ref[0][(pixly * 16 + pixlx) * 3 + 1],
						ref[0][(pixly * 16 + pixlx) * 3 + 2]]);
					var i = findrgb(nrgb);
					if(i == -1){
						rgbn = 0;
						rgb.unshift(nrgb);
					} else {
						rgbn = i;
					}
					paint = false;
					break;
				case 2:
					sel = [255, 255, 255];
					break;
			}
			if(paint && !(ref[0][(pixly * 16 + pixlx) * 3] == sel[0] &&
				ref[0][(pixly * 16 + pixlx) * 3 + 1] == sel[1] &&
				ref[0][(pixly * 16 + pixlx) * 3 + 2] == sel[2]) && pbuckt.canspend(1)){
				undos.push([cursorx >> 4, cursory >> 4, pixlx << 4 | pixly,
					ref[0][(pixly * 16 + pixlx) * 3],
					ref[0][(pixly * 16 + pixlx) * 3 + 1],
					ref[0][(pixly * 16 + pixlx) * 3 + 2]]);
				updatechunk(ref, pixlx, pixly, sel);
				var arr = new ArrayBuffer(11);
				var dv = new DataView(arr);
				dv.setInt32(0, cursorx >> 4, true);
				dv.setInt32(4, cursory >> 4, true);
				dv.setUint8(8, sel[0]);
				dv.setUint8(9, sel[1]);
				dv.setUint8(10, sel[2]);
				socket.send(arr);
			}
			break;
			
		case 2:
			var nrgb = new Uint8Array(
				[ref[0][(pixly * 16 + pixlx) * 3],
				ref[0][(pixly * 16 + pixlx) * 3 + 1],
				ref[0][(pixly * 16 + pixlx) * 3 + 2]]);
			var i = findrgb(nrgb);
			if(i == -1){
				rgbn = 0;
				rgb.unshift(nrgb);
			} else {
				rgbn = i;
			}
			break;

		case 3:
			var cl = false;
			for(var i = ref[0].length; i--;){
				if(ref[0][i] != 255){
					cl = true;
					break;
				}
			}
			if(cl){
				var arr = new ArrayBuffer(9);
				var dv = new DataView(arr);
				dv.setInt32(0, chnkx, true);
				dv.setInt32(4, chnky, true);
				dv.setUint8(8, 0);
				socket.send(arr);
			}
			break;
	}
}

function sendupdates(){
	setTimeout(sendupdates, 65);
	if((tool != senttl || sentmx != cursorx || sentmy != cursory || sentrgb[0] != rgb[rgbn][0] || sentrgb[1] != rgb[rgbn][1] || sentrgb[2] != rgb[rgbn][2]) && socket.readyState == socket.OPEN){
		sentrgb = rgb[rgbn];
		sentmx = cursorx;
		sentmy = cursory;
		senttl = tool;
		/* send updates to server */
		var arr = new ArrayBuffer(12);
		var dv = new DataView(arr);
		dv.setInt32(0, cursorx, true);
		dv.setInt32(4, cursory, true);
		dv.setUint8(8, rgb[rgbn][0]);
		dv.setUint8(9, rgb[rgbn][1]);
		dv.setUint8(10, rgb[rgbn][2]);
		dv.setUint8(11, tool);
		socket.send(arr);
	}
}

function requestchunk(x, y){
	if(x > 0xFFFFF || y > 0xFFFFF || x < ~0xFFFFF || y < ~0xFFFFF || !id)
		return;
	var arr = new ArrayBuffer(8);
	var dv = new DataView(arr);
	/* TODO: chunk request timeout */
	req.push(x + ',' + y);
	dv.setInt32(0, x, true);
	dv.setInt32(4, y, true);
	socket.send(arr);
}

function updatechunk(map, px, py, rgb){
	map[0][(py * 16 + px) * 3] = rgb[0];
	map[0][(py * 16 + px) * 3 + 1] = rgb[1];
	map[0][(py * 16 + px) * 3 + 2] = rgb[2];
	if(map[1]){
		var cctx = map[1].getContext("2d");
		cctx.fillStyle = "rgb(" + rgb.join(',') + ")";
		cctx.fillRect(px << 4, py << 4, 16, 16);
		if(py == 15){
			cctx.beginPath();
			cctx.moveTo(px << 4, (py << 4) + 16);
			cctx.lineTo((px << 4) + 16, (py << 4) + 16);
			cctx.stroke();
		}
		if(px == 0){
			cctx.beginPath();
			cctx.moveTo(px << 4, py << 4);
			cctx.lineTo(px << 4, (py << 4) + 16);
			cctx.stroke();
		} else {
			cctx.globalAlpha = .2;
			cctx.beginPath();
			cctx.moveTo((px << 4) + .5, py << 4);
			cctx.lineTo((px << 4) + .5, 1 + py << 4);
			cctx.stroke();
		}
		if(py != 0){
			cctx.globalAlpha = .2;
			cctx.beginPath();
			cctx.moveTo(1 + px << 4, (py << 4) + .5);
			cctx.lineTo((px << 4) + .5, (py << 4) + .5);
			cctx.stroke();
		}
		cctx.globalAlpha = 1;
		keeprendering();
	}
}

function renderchunk(arr){
	var ccvs = document.createElement("canvas");
	ccvs.width = 256;
	ccvs.height = 256;
	var cctx = ccvs.getContext("2d");
	cctx.fillStyle = "rgb(" + arr[0] + "," + arr[1] + "," + arr[2] + ")";
	cctx.fillRect(0, 0, 16, 16);
	for(var i = arr.length; i -= 3;){
		cctx.fillStyle = "rgb(" + arr[i] + "," + arr[i+1] + "," + arr[i+2] + ")";
		var y = i / 3 >> 4;
		var x = i / 3 - 16 * (i / 3 >> 4);
		cctx.fillRect(x << 4, y << 4, 16, 16);
	}
	cctx.setLineDash([1]);
	cctx.globalAlpha = .2;
	for(var i = 16; --i;){
		cctx.beginPath();
		cctx.moveTo((i << 4) + .5, 0);
		cctx.lineTo((i << 4) + .5, 256);
		cctx.stroke();
		cctx.beginPath();
		cctx.moveTo(0, (i << 4) + .5);
		cctx.lineTo(256, (i << 4) + .5);
		cctx.stroke();
	}
	cctx.globalAlpha = 1;
	cctx.beginPath();
	cctx.moveTo(0, 0);
	cctx.lineTo(0, 256);
	cctx.lineTo(256, 256);
	cctx.stroke();
	return ccvs;
}

function getvisiblechunks(){
	var visible = {};
	var cx = (~camx >> 8) - 1;
	var mx = ~camx + canvas.width >> 8;
	var cy = (~camy >> 8) - 1;
	var my = ~camy + canvas.height >> 8;
	while(++cx <= mx){
		var oh = cy;
		while(++oh <= my){
			visible[[cx, oh]] = true;
		}
	}
	return Object.keys(visible);
}

function freemem(){
	for(var i in map){
		if(visible.indexOf(i) == -1){
			delete map[i];
		}
	}
}

function updatevisible(){
	var oldvisible = visible.splice(0);
	visible = getvisiblechunks();
	if(socket.readyState == socket.OPEN){
		for(var i = visible.length; i--;){
			var j = oldvisible.indexOf(visible[i]);
			if(j != -1)
				oldvisible.splice(j, 1);
			if(visible[i] in map || req.indexOf(visible[i].toString()) != -1){
				continue;
			}
			var pos = visible[i].split(',');
			requestchunk(pos[0], pos[1]);
		}
	}
	for(var i = oldvisible.length; i--;){
		if(oldvisible[i] in map && map[oldvisible[i]][1]){
			/* mem leak bug here, canvas not deleted properly on some chrom* versions */
			var maptodel = map[oldvisible[i]];
			maptodel[1].width = maptodel[1].height = 0;
			maptodel[1] = null;
		}
	}
	if(Object.keys(map).length > 30000)
		freemem(); /* TODO: would like to unload furthest chunks first */
	keeprendering();
}

function drawtext(str, x, y, centered){
	ctx.strokeStyle = "#000000",
	ctx.fillStyle = "#FFFFFF",
	ctx.lineWidth = 2.5,
	ctx.globalAlpha = 0.5;
	if(centered)
		x -= ctx.measureText(str).width >> 1;
	ctx.strokeText(str, x, y);
	ctx.globalAlpha = 1;
	ctx.fillText(str, x, y);
}

function render(){
	nt = Date.now();
	ctx.save();
	ctx.transform(zoom, 0, 0, zoom, camx, camy);
	for(var i = visible.length; i--;){
		var pos = visible[i].split(',');
		if(pos in map){
			if(!map[pos][1]){
				map[pos][1] = renderchunk(map[pos][0]);
			}
			ctx.drawImage(map[pos][1], pos[0] << 8, pos[1] << 8);
		} else {
			ctx.beginPath();
			ctx.fillStyle = unloadedpat;
			ctx.rect(pos[0] << 8, pos[1] << 8, 256, 256);
			ctx.fill();
		}
	}
	ctx.lineWidth = 2.5;
	ctx.globalAlpha = .8;
	if([chnkx, chnky] in map){
		ctx.globalAlpha = .8;
		if(tool == 0){
			ctx.strokeStyle = "rgb(" + rgb[rgbn].join(',') + ")";
			ctx.strokeRect(~(~cursorx | 0xF), ~(~cursory | 0xF), 16, 16);
		} else if(tool == 3){
			ctx.strokeStyle = "#FFFFFF";
			ctx.strokeRect(~(~cursorx | 0xFF) + 1, ~(~cursory | 0xFF), 254, 255);
		}
	}
	for(var c in ppl){
		if(c != id){
			var pplx = ppl[c].getX();
			var pply = ppl[c].getY();
			if(!isvisible(pplx - 32, pply - 32, 64, 64))
				continue;
			var chxy = [pplx >> 8, pply >> 8];
			if(chxy in map){
				if(ppl[c].tool == 0){
					ctx.strokeStyle = "rgb(" + ppl[c].r + "," + ppl[c].g + "," + ppl[c].b + ")";
					ctx.strokeRect(~(~pplx | 0xF), ~(~pply | 0xF), 16, 16);
				} else if(ppl[c].tool == 2){
					ctx.globalAlpha = 1;
					var pxy = [pplx - (chxy[0] << 8) >> 4, pply - (chxy[1] << 8) >> 4];
					var m = map[chxy];
					var nrgb = [m[0][(pxy[1] * 16 + pxy[0]) * 3],
						m[0][(pxy[1] * 16 + pxy[0]) * 3 + 1],
						m[0][(pxy[1] * 16 + pxy[0]) * 3 + 2]];
					ctx.fillStyle = "rgb(" + nrgb.join(',') + ")";
					ctx.fillRect(pplx + .5, pply - 30.5, 8, 8);
					ctx.strokeStyle = "#4d313b";
					ctx.strokeRect(pplx - .5, pply - 31.5, 10, 10);
					ctx.strokeStyle = "#FFFFFF";
					ctx.lineWidth = 1;
					ctx.strokeRect(pplx - .5, pply - 31.5, 10, 10);
					ctx.lineWidth = 3.5;
				} else if(ppl[c].tool == 3){
					ctx.strokeStyle = "#FFFFFF";
					ctx.strokeRect(~(~pplx | 0xFF) + 1, ~(~pply | 0xFF), 254, 255);
				}
			}
		}
	}
	ctx.lineWidth = 1.75;
	for(var i = fx.length; i--;){
		if((ctx.globalAlpha = 1 + (fx[i][2] - nt) / 1000) <= 0){
			fx.splice(i, 1);
			continue;
		}
		if(fx[i].length == 4){
			ctx.strokeStyle = "rgb(" + ((fx[i][3] >> 16) & 0xFF) + "," + ((fx[i][3] >> 8) & 0xFF) + "," + (fx[i][3] & 0xFF) + ")";
			ctx.strokeRect(.5+(fx[i][0] << 4), .5+(fx[i][1] << 4), 15, 15);
		} else {
			ctx.strokeStyle = "#000000";
			ctx.strokeRect(.5+(fx[i][0] << 8), .5+(fx[i][1] << 8), 256, 256);
		}
	}
	ctx.globalAlpha = 1;
	ctx.strokeStyle = "#000000";
	for(var c in ppl){
		if(c != id){
			var pplx = ppl[c].getX();
			var pply = ppl[c].getY();
			if(!isvisible(pplx - 32, pply - 32, 64, 64))
				continue;
			ctx.drawImage(cur[ppl[c].tool][0], pplx + cur[ppl[c].tool][1], pply + cur[ppl[c].tool][2]);
			ctx.font = "10px sans-serif";
			var w = ctx.measureText(c.toString()).width + 8;
			var h = 10;
			var ofs = cur[ppl[c].tool][0].height + cur[ppl[c].tool][2];
			ctx.fillStyle = "#" + ppl[c].clr;
			ctx.fillRect(pplx, pply + ofs, w, h + 6);
			ctx.globalAlpha = 0.2;
			ctx.lineWidth = 3;
			ctx.strokeRect(pplx, pply + ofs, w, h + 6);
			ctx.globalAlpha = 1;
			drawtext(c.toString(), pplx + 4, pply + h + ofs + 2);
			ctx.font = "14px sans-serif";
		}
	}
	if([[chnkx, chnky]] in map && tool == 2){
		var ref = map[[chnkx, chnky]];
		var nrgb = new Uint8Array(
			[ref[0][(pixly * 16 + pixlx) * 3],
			ref[0][(pixly * 16 + pixlx) * 3 + 1],
			ref[0][(pixly * 16 + pixlx) * 3 + 2]]);
		ctx.fillStyle = "rgb(" + nrgb.join(',') + ")";
		ctx.fillRect(cursorx + .5, cursory - 30.5, 8, 8);
		ctx.strokeStyle = "#4d313b";
		ctx.lineWidth = 3.5;
		ctx.strokeRect(cursorx - .5, cursory - 31.5, 10, 10);
		ctx.strokeStyle = "#FFFFFF";
		ctx.lineWidth = 1;
		ctx.strokeRect(cursorx - .5, cursory - 31.5, 10, 10);
	}
	ctx.restore();
	ctx.strokeStyle = "#000000";
	/* Render windows */
	ctx.globalAlpha = 0.9;
	ctx.save();
	for(var x = 0; x < windows.length; x++){
		if(x == windows.length - 1)
			ctx.globalAlpha = 1;
		windows[x].render(ctx);
	}
	ctx.restore();
	var hudx = canvas.width - 40;
	var hudy = (canvas.height >> 1) - 16;
	ctx.fillStyle = "#DDDDDD";
	ctx.fillRect(hudx - 4, hudy - 4, 44, 40);
	ctx.fillStyle = "#888888";
	ctx.fillRect(hudx - 32, hudy + 4, 24, 24);
	ctx.globalAlpha = 0.2;
	ctx.strokeRect(hudx - 4, hudy - 4, 44, 40);
	ctx.strokeRect(hudx - 32, hudy + 4, 24, 24);
	ctx.globalAlpha = 1;
	ctx.strokeStyle = "#FFFFFF";
	ctx.beginPath();
	ctx.moveTo(hudx - 20, hudy + 8);
	ctx.lineTo(hudx - 20, hudy + 24);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(hudx - 28, hudy + 16);
	ctx.lineTo(hudx - 12, hudy + 16);
	ctx.stroke();
	ctx.strokeStyle = "#000000";
	for(var j = rgbn + 1, i = 0; --j >= 0; --i){
		ctx.fillStyle = "rgb(" + rgb[j].join(',') + ")";
		ctx.fillRect(hudx, hudy - 40 * i, 32, 32);
		ctx.globalAlpha = 0.2;
		ctx.strokeRect(hudx, hudy - 40 * i, 32, 32);
		ctx.globalAlpha = 1;
	}
	for(var j = rgbn, i = 1; ++j < rgb.length; ++i){
		ctx.fillStyle = "rgb(" + rgb[j].join(',') + ")";
		ctx.fillRect(hudx, hudy - 40 * i, 32, 32);
		ctx.globalAlpha = 0.2;
		ctx.strokeRect(hudx, hudy - 40 * i, 32, 32);
		ctx.globalAlpha = 1;
	}
	ctx.fillStyle = "#444444";
	if(chatting){
		ctx.globalAlpha = .7;
		var maxw = 300;
		for(var i = chatlog.length, j = 0; i-- && j < 12; j++){
			maxw = Math.max(ctx.measureText(chatlog[i]).width, maxw);
		}
		maxw = Math.max(ctx.measureText("> " + chatstr).width, maxw);
		var h = chatlog.length;
		h = (h >= 12 ? 12 : h) + 1;
		ctx.fillRect(0, canvas.height - h * 16 - 8, maxw + 10, h * 16 + 16);
		ctx.globalAlpha = .2;
		ctx.lineWidth = 3;
		ctx.strokeRect(-1, canvas.height - h * 16 - 8, maxw + 10.5, h * 16 + 16);
		ctx.globalAlpha = .4;
		ctx.strokeRect(-1, canvas.height - 18, maxw + 10.5, 19);
		ctx.fillStyle = "#DDDDDD";
		ctx.fillRect(-1, canvas.height - 18, maxw + 10.5, 19);
		drawtext("> " + chatstr + (((nt >> 8) & 1) ? '_' : ''), 5, canvas.height - 5);
	}
	ctx.globalAlpha = 1;
	for(var i = chatlog.length, j = +chatting; i-- && j <= (chatting ? 12 : 6); j++){
		drawtext(chatlog[i], 5, canvas.height - j * 16 - 8);
	}
	var j = (nt - dt[0]) / 500;
	j = j >= 1 ? 1 : j <= 0 ? 0 : j;
	ctx.drawImage(drop, (canvas.width >> 1) - (drop.width >> 1), -drop.height + 14 + (drop.height - 14) * (dt[1] ? j : 1 - j));
	ctx.drawImage(cur[tool][0], mousex + cur[tool][1], mousey + cur[tool][2]);
	var xystr = "X: " + ((chnkx << 4) + pixlx) + ", Y: " + ((chnky << 4) + pixly);
	if(con){
		var pplstr = count + " cursor" + (count != 1 ? "s" : "") + " online";
		drawtext(pplstr, canvas.width - ctx.measureText(pplstr).width - 5, 14);
	}
	var xyw = ctx.measureText(xystr).width;
	ctx.fillStyle = "#888888";
	ctx.globalAlpha = .7;
	ctx.fillRect(0, 0, xyw + 8, 19);
	ctx.globalAlpha = .2;
	ctx.strokeRect(-1, -1, xyw + 8, 19);
	drawtext(xystr, 4, 14);
	if(nt - t < 2500){
		window.requestAnimationFrame(render);
	}
}

function onmsg(m){
	m = m.data;
	if(typeof m === "string"){
		chatlog.push(m);
		keeprendering();
		return;
	}
	var dv = new DataView(m);
	switch(dv.getUint8(0)){
		case 0:
			id = dv.getUint32(1, true);
			console.log("Got ID: " + id);
			chatlog.push("Chat by pressing enter. (Your ID: " + id + ")");
			map = {};
			req = [];
			ppl = {};
			count = 0;
			updatevisible();
			break;
		
		case 1:
			var rdr = false;
			for(var i = dv.getUint8(1); i--;){
				var rid = dv.getUint32(2 + i * 16, true);
				var rmx = dv.getInt32(2 + i * 16 + 4, true);
				var rmy = dv.getInt32(2 + i * 16 + 8, true);
				var rr = dv.getUint8(2 + i * 16 + 12);
				var rg = dv.getUint8(2 + i * 16 + 13);
				var rb = dv.getUint8(2 + i * 16 + 14);
				var rtool = dv.getUint8(2 + i * 16 + 15);
				if(rid in ppl){
					ppl[rid].update(rmx, rmy, rr, rg, rb, rtool);
				} else {
					++count;
					ppl[rid] = new Cursor(rmx, rmy, rr, rg, rb, rtool, rid);
				}
				if(rid != id && isvisible(rmx - 16, rmy - 16, 40, 40)){
					rdr = true;
				}
			}
			var off = 2 + dv.getUint8(1) * 16;
			for(var i = dv.getUint16(off, true); i--;){
				var rpx = dv.getInt32(2 + off + i * 11, true);
				var rpy = dv.getInt32(2 + off + i * 11 + 4, true);
				var rr = dv.getUint8(2 + off + i * 11 + 8);
				var rg = dv.getUint8(2 + off + i * 11 + 9);
				var rb = dv.getUint8(2 + off + i * 11 + 10);
				if(isvisible(rpx << 4, rpy << 4, 16, 16)){
					fx.push([rpx, rpy, nt, 0xFFFFFF - ((rr << 16) + (rg << 8) + rb)]);
				}
				if([rpx >> 4, rpy >> 4] in map){
					updatechunk(map[[rpx >> 4, rpy >> 4]], rpx & 0xF, rpy & 0xF, [rr, rg, rb]);
				}
			}
			off += dv.getUint16(off, true) * 11 + 2;
			for(var i = dv.getUint8(off); i--;){
				var rid = dv.getUint32(1 + off + i * 4, true);
				if(rid in ppl){
					--count;
					delete ppl[rid];
				}
			}
			if(rdr)
				keeprendering();
			break;
		
		case 2:
			var rx = dv.getInt32(1, true);
			var ry = dv.getInt32(5, true);
			var dat = new Uint8Array(m);
			var i = req.indexOf(rx + "," + ry);
			if(i != -1){
				req.splice(i, 1);
			} else {
				fx.push([rx, ry, nt]);
			}
			var m = map[[rx, ry]] = [new Uint8Array(768), null];
			for(i = 9; i < 777; i++)
				m[0][i - 9] = dat[i];
			keeprendering();
			break;

		case 3:
			var rx = dv.getInt32(1, true);
			var ry = dv.getInt32(5, true);
			cursorx = (rx << 4) + 8;
			cursory = (ry << 4) + 8;
			mousex = window.innerWidth >> 1;
			mousey = window.innerHeight >> 1;
			camx = ~((rx << 4) - mousex + 8);
			camy = ~((ry << 4) - mousey + 8);
			updatevisible();
			keeprendering();
			break;

		case 4:
			if(toolswindow && !a){
				a = true;
				var b = new GUIButton(12, 0, 45, 43, uitex, function(){ changetool(3); }, true, {texpos: [32, 168, 32, 32]});
				tools.push(b);
				toolswindow.addElement(b);
			}
			break;
	}
}

function stoi(s, max){
	var ints = [];
	var fstr = "";
	for(var i = 0; i < s.length && i < max; i++){
		var cc = s.charCodeAt(i);
		if(cc > 64 && cc < 91) cc += 32;
		if((cc > 96 && cc < 123) || (cc > 47 && cc < 58) || cc == 95 || cc == 46){
			ints.push(cc);
			fstr += String.fromCharCode(cc);
		}
	}
	return [ints, fstr];
}

function joinworld(str){
	var nstr = stoi(str, 24);
	var arr = new ArrayBuffer(nstr[0].length + 2);
	var dv = new DataView(arr);
	for(var i = nstr[0].length; i--;){
		dv.setUint8(i, nstr[0][i]);
	}
	dv.setUint16(nstr[0].length, 1337, true);
	if(window.history.pushState && str !== nstr[1]){
		window.history.pushState({}, null, "/" + encodeURIComponent(nstr[1]));
	}
	socket.send(arr);
	return nstr[1];
}

function onopen(){
	con = true;
	pbuckt = new Bucket(32, 4);
	cbuckt = new Bucket(4, 6);
	console.log("Connected!");
	var worldname = decodeURIComponent(window.location.pathname);
	if(worldname.substr(0, 1) == "/") worldname = worldname.substr(1);
	if(worldname == "") worldname = "main";
	var nstr = joinworld(worldname);
	chatlog.push("Connected! Joining world: " + nstr);
}

function onclose(){
	con = false;
	console.log("Socket closed.");
	chatlog.push("Disconnected from the server!");
	map = {};
	ppl = {};
	keeprendering();
}

window.oncontextmenu = function(){ return false; };

document.onkeypress = function(e){
	var key = e.charCode || e.keyCode;
	var prevdef = false;
	if(!textfocus){
		switch(key){
			case 13:
				if(cbuckt){
					var nstr = chatstr.trim();
					if(!nstr.length || !chatting){
						chatstr = "";
						chatting = !chatting;
						break;
					}
					var cspd = cbuckt.canspend(1);
					if(cspd && socket.readyState == socket.OPEN){
						socket.send(nstr+String.fromCharCode(10));
						chatstr = "";
						cwarn = false;
					} else if(!cspd){
						if(!cwarn){
							chatlog.push("You're talking too fast. Slow down!");
							cwarn = true;
						}
						break;
					}
					chatting = !chatting;
				}
				keeprendering();
				prevdef = true;
				break;
				
			case 122:
			case 26:
				if(!chatting && e.ctrlKey && undos.length){
					var ref = map[[undos[undos.length-1][0] >> 4, undos[undos.length-1][1] >> 4]];
					if(ref && pbuckt.canspend(1)){
						var edit = undos.pop();
						var srgb = edit.splice(3, 3);
						updatechunk(ref, ((edit[2] & 0xF0) >> 4), (edit[2] & 0xF), srgb);
						var arr = new ArrayBuffer(11);
						var dv = new DataView(arr);
						dv.setInt32(0, edit[0], true);
						dv.setInt32(4, edit[1], true);
						dv.setUint8(8, srgb[0]);
						dv.setUint8(9, srgb[1]);
						dv.setUint8(10, srgb[2]);
						socket.send(arr);
					}
					prevdef = true;
				}
			default:
				if(chatting && chatstr.length < 80 && e.charCode){
					chatstr += String.fromCharCode(e.charCode);
					keeprendering();
					prevdef = true;
				}
				break;
		}
		if(!chatting && (key == 70 || key == 102)){
			var nrgb = [];
			var valid = true;
			for(var i = 0; i < 3; i++){
				nrgb[i] = parseInt(prompt("RGB"[i] + ": (0-255)"));
				if(!(Number.isInteger(nrgb[i]) && nrgb[i] >= 0 && nrgb[i] < 256)){
					valid = false;
					break;
				}
			}
			if(valid){
				var i = findrgb(nrgb);
				if(i == -1){
					rgbn = 0;
					rgb.unshift(nrgb);
				} else {
					rgbn = i;
				}
			}
			prevdef = true;
		}
	} else {
		textfocus.onkeypress(e);
		prevdef = true;
	}
	if(prevdef){
		e.preventDefault();
		e.stopPropagation();
		return false;
	}
}

function ToolsWindow(x, y){
	var win = toolswindow = new GUIWindow(x, y, 0, 0, "Tools", false, false);
	var updfunc = changetool = function(num){
		tools[tool].data.texpos[0] = tools[tool].data.texpos[2];
		tool = num;
		tools[num].data.texpos[0] = 0;
		win.rerender = true;
	};
	tools = [
		new GUIButton(12, 0, 45, 43, uitex, function(){ updfunc(0); }, true, {texpos: [0, 72, 26, 31]}),
		new GUIButton(12, 0, 45, 43, uitex, function(){ updfunc(1); }, true, {texpos: [36, 103, 36, 36]}),
		new GUIButton(12, 0, 45, 43, uitex, function(){ updfunc(2); }, true, {texpos: [29, 139, 29, 29]})
	];
	for(var i = 0; i < tools.length; i++){
		win.addElement(tools[i]);
	}
	return win;
}

window.onload = function(){
	canvas = document.getElementById("canvas");
	ctx = canvas.getContext("2d");
	window.addEventListener("resize", resize);
	window.onmousemove = mousemove;
	window.onmousedown = mousedown;
	window.onmouseup = mouseup;
	window.onwheel = mousewheel;
	window.addEventListener('DOMMouseScroll', mousewheel);
	socket = new WebSocket("ws://www.ourworldofpixels.com:443");
	socket.binaryType = "arraybuffer";
	socket.onmessage = onmsg;
	socket.onopen = onopen;
	socket.onclose = onclose;
	try {
		dragnpaint = window.localStorage && (window.localStorage.dragNPaint == "1" ? true : false);
	} catch(e) { }
	mousex = camx = window.innerWidth >> 1;
	mousey = camy = window.innerHeight >> 1;
	resize();
	windows.push(ToolsWindow(5, 24));
	setTimeout(sendupdates, 50);
	keeprendering();
};
})();
