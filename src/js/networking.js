"use strict";

import { EventEmitter } from "events";

import config from "./config";

import { States, Protocol } from "./protocol";

class NetBase extends EventEmitter {
	constructor(serverAddress) {
		super();
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
		this.emit("open");
		
		grecaptcha.execute();
	}
	
	messageHandler(message) {
		message = Buffer.from(message.data);
		let packet = this.protocol.states[this.state].deserialize(message);
		
		this.emit("packet", packet);
		
		this.emit(packet.name, packet.params);
	}
	
	closeHandler() {
		this.emit("close");
	}
	
	sendPacket(name, params) {
		this.ws.send(this.protocol.states[this.state].serialize({
			name: name,
			params: params
		}));
	}
}

export default class Networking extends NetBase {
	constructor(serverAddress, worldName) {
		super(serverAddress);
		
		this.worldName = worldName || config.defaultWorld;
		
		this.on("packet", console.log);
		
		this.on("loginResponse", function(data) {
			this.state = States.PLAY;
		}.bind(this));
		
		this.on("worldData", function(data) {
			
		}.bind(this));
	}
	
	loginGuest(token) {
		this.sendPacket("login", {
			guest: true,
			token: token,
			worldName: this.worldName
		});
	}
}
