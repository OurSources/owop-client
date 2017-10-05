'use strict';
import { colorUtils as color } from './color.js';

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

// This fixes modulo to work on negative numbers (-1 % 16 = 15)
export function absMod(n1, n2) {
	return ((n1 % n2) + n2) % n2;
}

export function openColorPicker(defColor, callback) {
	var colorI = document.createElement('input');
	colorI.onchange = function() {
		var value = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(this.value);
		callback([parseInt(value[1], 16), parseInt(value[2], 16), parseInt(value[3], 16)]);
	};
	colorI.type = 'color';
	colorI.value = color.toHTML(color.u24_888(defColor[2], defColor[1], defColor[0]));
	colorI.click();
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

export function loadScript(name) {
	document.getElementsByTagName('head')[0].appendChild(mkHTML("script", {
		type: "text/javascript",
		src: name
	}));
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
			className: 'framed tooltip whitetext',
			style: 'visibility: hidden;'
		});
		document.body.appendChild(tip);
		var tpos = tip.getBoundingClientRect();
		y -= tpos.height / 2;
		var x = epos.left - tpos.width - elementSpacing;
		if (x < elementSpacing) {
			x = epos.right + tpos.width + elementSpacing;
		}
		tip.style = `transform: translate(${Math.round(x)}px,${Math.round(y)}px);`;
		intr = 0;
	}
	const mleave = e => {
		clearTimeout(intr);
		intr = 0;
		element.removeEventListener('mouseleave', mleave);
		element.removeEventListener('click', mleave);
		if (tip !== null) {
			tip.remove();
			tip = null;
		}
	};
	const menter = e => {
		if (tip === null && intr === 0) {
			intr = setTimeout(tooltip, 500);
			element.addEventListener('click', mleave);
		}
	};
	element.addEventListener('mouseenter', menter);
	element.addEventListener('mouseleave', mleave);
}

export function decompress(input) {
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
}
