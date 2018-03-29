'use strict';
import { EVENTS as e } from './../conf.js';
import { eventSys } from './../global.js';

export class Protocol {
    constructor(ws) {
        this.ws = ws;
    }

    hookEvents() {
        this.ws.addEventListener('message', this.messageHandler.bind(this));
        this.ws.addEventListener('open', this.openHandler.bind(this));
        this.ws.addEventListener('close', this.closeHandler.bind(this));
    }

    isConnected() {
        return this.ws.readyState === WebSocket.OPEN;
    }

    openHandler() {
        eventSys.emit(e.net.connected);
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

    updatePixel(x, y, rgb) {

    }

    sendUpdates() {

    }

    sendMessage(str) {

    }
}