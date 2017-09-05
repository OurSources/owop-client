'use strict';
import { EVENTS as e } from './../conf.js';
import { eventSys } from './../global.js';

export class Protocol {
    constructor(ws) {
        this.ws = ws;
    }

    hookEvents(subClass) {
        this.ws.addEventListener('message', subClass.messageHandler.bind(subClass));
        this.ws.addEventListener('open', subClass.openHandler.bind(subClass));
        this.ws.addEventListener('close', subClass.closeHandler.bind(subClass));
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