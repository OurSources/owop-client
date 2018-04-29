"use strict";

import { ProtoDef } from 'protodef';
import protoData from 'protocol.json';

import { Buffer } from 'buffer';

import { EVENTS as e, options } from './conf.js';
import { eventSys } from './global.js';

import { PublicAPI } from './global.js';

const States = {
	LOGIN: 0,
	PLAY: 1
};
for (let i in States) {
	States[States[i]] = i;
}

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
	constructor(serverAddress, worldName) {
		this.worldName = worldName || options.defaultWorld;
		
		this.state = States.LOGIN;
		
		this.states = {
			[States.LOGIN]: new LoginState(),
			[States.PLAY]: new PlayState()
		};
		
		this.ws = new WebSocket(serverAddress);
		this.ws.binaryType = "arraybuffer";

		this.ws.addEventListener("open", function() {
			this.openHandler();
		}.bind(this));
		this.ws.addEventListener("message", function(message) {
			this.messageHandler(message);
		}.bind(this));
		this.ws.addEventListener("close", function() {
			this.closeHandler();
		}.bind(this));
	}

	get connected() {
		return this.ws.readyState === WebSocket.OPEN;
	}
	
	openHandler() {
		eventSys.emit(e.net.connected);
		
		grecaptcha.execute();
	}
	
	messageHandler(message) {
		message = Buffer.from(message.data);
		console.log(message);
		let packet = this.states[this.state].deserialize(message);
		console.log(packet);
		
		switch(packet.name) {
			case "loginResponse":
				
				break;
		}
	}
	
	closeHandler() {
		eventSys.emit(e.net.disconnected);
	}
	
	sendPacket(packet) {
		this.ws.send(this.states[this.state].serialize(packet));
	}
	
	loginGuest(token) {
		this.sendPacket({
			name: "login",
			params: {
				guest: true,
				token: token,
				worldName: this.worldName
			}
		});
	}
}
