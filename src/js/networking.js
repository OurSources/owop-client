"use strict";

import config from "./config";

import { States, Protocol } from "./protocol";

export default class Networking {
	constructor(serverAddress, worldName) {
		this.worldName = worldName || config.defaultWorld;
		
		this.protocol = new Protocol();
		
		this.state = States.LOGIN;
		
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
		
		grecaptcha.execute();
	}
	
	messageHandler(message) {
		message = Buffer.from(message.data);
		console.log(message);
		let packet = this.protocol.states[this.state].deserialize(message);
		console.log(packet);
		
		if (this.state == States.LOGIN) {
			switch(packet.name) {
				case "loginResponse":
					this.state = States.PLAY;
					break;
			}
		} else if (this.state == States.PLAY) {
			switch(packet.name) {
				case "worldData":
					
					break;
			}
		}
	}
	
	closeHandler() {
		
	}
	
	sendPacket(packet) {
		this.ws.send(this.protocol.states[this.state].serialize(packet));
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
