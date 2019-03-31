'use strict';
import { colorUtils as color } from './color.js';
import { PublicAPI } from './../global.js';

PublicAPI.util = {
	getTime,
	cookiesEnabled,
	storageEnabled,
	absMod,
	escapeHTML,
	mkHTML,
	setTooltip,
	waitFrames,
	line,
	loadScript
};

let time = Date.now();
export function getTime(update) {
	return update ? (time = Date.now()) : time;
}

export function setCookie(name, value) {
	document.cookie = `${name}=${value}; expires=Fri, 31 Dec 9999 23:59:59 GMT`;
}

export function getCookie(name) {
    var cookie = document.cookie.split(';');
	for (var i = 0; i < cookie.length; i++) {
		var idx = cookie[i].indexOf(name + '=');
		if (idx === 0 || (idx === 1 && cookie[i][0] === ' ')) {
			var off = idx + name.length + 1;
			return cookie[i].substring(off, cookie[i].length);
        }
    }
	return null;
}

export function cookiesEnabled() {
	return navigator.cookieEnabled;
}

export function storageEnabled() {
	try {
		return !!window.localStorage;
	} catch (e) {
		return false;
	}
}

export function propertyDefaults(obj, defaults) {
	if (obj) {
		for (var prop in obj) {
			if (obj.hasOwnProperty(prop)) {
				defaults[prop] = obj[prop];
			}
		}
	}
	return defaults;
}

// This fixes modulo to work on negative numbers (-1 % 16 = 15)
export function absMod(n1, n2) {
	return ((n1 % n2) + n2) % n2;
}

export function htmlToElement(html) {
	return mkHTML("template", {
		innerHTML: html
	}).content.firstChild;
}

export function escapeHTML(text) {
	return text.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\"/g, '&quot;')
		.replace(/\'/g, '&#39;')
		.replace(/\//g, '&#x2F;');
}

/* Makes an HTML element with the values specified in opts */
export function mkHTML(tag, opts) {
	var elm = document.createElement(tag);
	for (var i in opts) {
		elm[i] = opts[i];
	}
	return elm;
}

export function loadScript(name, callback) {
	document.getElementsByTagName('head')[0].appendChild(mkHTML("script", {
		type: "text/javascript",
		src: name,
		onload: callback
	}));
}

export function eventOnce(element, events, func) {
	var ev = events.split(' ');
	var f = e => {
		for (var i = 0; i < ev.length; i++) {
			element.removeEventListener(ev[i], f);
		}
		return func();
	};

	for (var i = 0; i < ev.length; i++) {
		element.addEventListener(ev[i], f);
	}
}

export function setTooltip(element, message) {
	const elementSpacing = 10;
	var intr = 0;
	var tip = null;
	function tooltip() {
		var epos = element.getBoundingClientRect();
		var y = epos.top + epos.height / 2;
		tip = mkHTML('span', {
			innerHTML: message,
			className: 'framed tooltip whitetext'
		});
		document.body.appendChild(tip);
		var tpos = tip.getBoundingClientRect();
		y -= tpos.height / 2;
		var x = epos.left - tpos.width - elementSpacing;
		if (x < elementSpacing) {
			x = epos.right + elementSpacing;
		}
		tip.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
		intr = 0;
	}
	const mleave = e => {
		clearTimeout(intr);
		intr = 0;
		element.removeEventListener('mouseleave', mleave);
		element.removeEventListener('click', mleave);
		element.removeEventListener('DOMNodeRemoved', mleave);
		if (tip !== null) {
			tip.remove();
			tip = null;
		}
	};
	const menter = e => {
		if (tip === null && intr === 0) {
			intr = setTimeout(tooltip, 500);
			element.addEventListener('click', mleave);
			element.addEventListener('mouseleave', mleave);
			element.addEventListener('DOMNodeRemoved', mleave);
		}
	};
	/*var observer = new MutationObserver(e => { // Why does this not fire at all?
		console.log(e, tip, intr);
		if (e[0].removedNodes && (tip !== null || intr !== 0)) {
			mleave();
		}
	});
	observer.observe(element, { childList: true, subtree: true });*/
	element.addEventListener('mouseenter', menter);
}

/* Waits n frames */
export function waitFrames(n, cb) {
	window.requestAnimationFrame(() => {
		return n > 0 ? waitFrames(--n, cb) : cb();
	})
}

export function decompress(u8arr) {
	var originalLength = u8arr[1] << 8 | u8arr[0];
	var u8decompressedarr = new Uint8Array(originalLength);
	var numOfRepeats = u8arr[3] << 8 | u8arr[2];
	var offset = numOfRepeats * 2 + 4;
	var uptr = 0;
	var cptr = offset;
	for (var i = 0; i < numOfRepeats; i++) {
		var currentRepeatLoc = (u8arr[4 + i * 2 + 1] << 8 | u8arr[4 + i * 2]) + offset;
		while (cptr < currentRepeatLoc) {
			u8decompressedarr[uptr++] = u8arr[cptr++];
		}
		var repeatedNum = u8arr[cptr + 1] << 8 | u8arr[cptr];
		var repeatedColorR = u8arr[cptr + 2];
		var repeatedColorG = u8arr[cptr + 3];
		var repeatedColorB = u8arr[cptr + 4];
		cptr += 5;
		while (repeatedNum--) {
			u8decompressedarr[uptr] = repeatedColorR;
			u8decompressedarr[uptr + 1] = repeatedColorG;
			u8decompressedarr[uptr + 2] = repeatedColorB;
			uptr += 3;
		}
	}
	while (cptr < u8arr.length) {
		u8decompressedarr[uptr++] = u8arr[cptr++];
	}
	return u8decompressedarr;
}

/*function decompressu16(input) {
	var originalLength = (((input[1] & 0xFF) << 8 | (input[0] & 0xFF)) + 1) * 2;
	var output = new Uint8Array(originalLength);
	var numOfRepeats = (input[3] & 0xFF) << 8 | (input[2] & 0xFF);
	var offset = numOfRepeats * 2 + 4;
	var uptr = 0;
	var cptr = offset;
	for (var i = 0; i < numOfRepeats; i++) {
		var currentRepeatLoc = 2 * ((((input[4 + i * 2 + 1] & 0xFF) << 8) | (input[4 + i * 2] & 0xFF)))
				+ offset;
		while (cptr < currentRepeatLoc) {
			output[uptr++] = input[cptr++];
		}
		var repeatedNum = ((input[cptr + 1] & 0xFF) << 8 | (input[cptr] & 0xFF)) + 1;
		var repeatedColorRGB = (input[cptr + 3] & 0xFF) << 8 | (input[cptr + 2] & 0xFF);
		cptr += 4;
		while (repeatedNum-- != 0) {
			output[uptr] = (repeatedColorRGB & 0xFF);
			output[uptr + 1] = ((repeatedColorRGB & 0xFF00) >> 8);
			uptr += 2;
		}
	}
	while (cptr < input.length) {
		output[uptr++] = input[cptr++];
	}
	return output;
}*/

export function line(x1, y1, x2, y2, size, plot) {
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
