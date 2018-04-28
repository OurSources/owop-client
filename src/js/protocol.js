"use strict";

import { ProtoDef } from 'protodef';
import protoData from 'protocol.json';

export class Protocol {
	constructor(serverAddress, worldName) {
		this.ws = new WebSocket(serverAddress);
		this.ws.binaryType = "arraybuffer";

		this.ws.addEventListener("open", this.open);
		this.ws.addEventListener("message", this.message);
		this.ws.addEventListener("close", this.close);
	}

	get connected() {
		return this.ws.readyState === WebSocket.OPEN;
	}
}
