'use strict';
import { EVENTS as e } from './../conf.js';
import { eventSys, AnnoyingAPI as aa } from './../global.js';

export class Protocol {
    constructor(ws) {
        this.ws = ws;
        this.lasterr = null;
    }

    hookEvents(subClass) {
        this.ws.addEventListener('message', subClass.messageHandler.bind(subClass));
        this.ws.addEventListener('open', subClass.openHandler.bind(subClass));
        this.ws.addEventListener('close', subClass.closeHandler.bind(subClass));
        this.ws.addEventListener('error', subClass.errorHandler.bind(subClass));
    }

    isConnected() {
        return this.ws.readyState === aa.ws.OPEN;
    }

    openHandler() {
        eventSys.emit(e.net.connected);
    }

    errorHandler(err) {
    	this.lasterr = err;
    }

    closeHandler() {
        eventSys.emit(e.net.disconnected);
    }

    messageHandler(message) {

    }

    joinWorld(name) {

    }

    requestChunk(x, y) {

    }

    /* Takes a flat [x0, y0, x1, y1, ...] array. Protocols that can't batch should
       fall back to one requestChunk call per pair. */
    requestChunks(coords) {
        for (var i = 0; i < coords.length; i += 2) {
            this.requestChunk(coords[i], coords[i + 1]);
        }
    }

    updatePixel(x, y, rgb) {

    }

    sendUpdates() {

    }

    sendMessage(str) {

    }
}