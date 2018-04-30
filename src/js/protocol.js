"use strict";

import { ProtoDef } from "protodef";
import protoData from "protocol.json";

import { Buffer } from "buffer";

export const States = {
	LOGIN: 0,
	PLAY: 1
};
// Do we even need this?
/*for (let i in States) {
	States[States[i]] = i;
}*/

class NetworkState {
	constructor() {
		this.toClient = new ProtoDef();
		this.toServer = new ProtoDef();
	}
	
	deserialize(msg) {
		return this.toClient.parsePacketBuffer("packet", msg).data;
	}

	serialize(packet) {
		return this.toServer.createPacketBuffer("packet", packet);
	}
}

class LoginState extends NetworkState {
	constructor() {
		super();
		
		this.toClient.addProtocol(protoData, ["login", "toClient"]);
		this.toServer.addProtocol(protoData, ["login", "toServer"]);
	}
}

class PlayState extends NetworkState {
	constructor() {
		super();
		
		this.toClient.addProtocol(protoData, ["play", "toClient"]);
		this.toServer.addProtocol(protoData, ["play", "toServer"]);
	}
}

export class Protocol {
	constructor() {
		this.states = {
			[States.LOGIN]: new LoginState(),
			[States.PLAY]: new PlayState()
		};
	}
}
