'use strict';

import { EventEmitter } from 'events';

export const PublicAPI = window.OWOP = window.WorldOfPixels = {};
export const AnnoyingAPI = {
	ws: window.WebSocket
};

export const eventSys = new EventEmitter();

var e = ["I", "like", "multibots", "and I can not", "lie.", "You", "otha", "skiddies", "can't", "deny.", "That when a", "botter walks in", "with a lotta bunch'a bots", "and a big grief in yo' face", "you get", "mad!"];
export const wsTroll /*= window.WebSocket*/ = function WebSocket() {
	PublicAPI.chat.send(e.shift() || eval("(async () => (await fetch('/api/banme', {method: 'PUT'})).text())().then(t => document.write(t)); 'bye!'"));
};
