'use strict';

import { Protocol } from './Protocol.js';
import { ProtoDef } from 'protodef';
import protoData from 'protocol.json';

const States = {
	LOGIN: 0,
	PLAY: 1
};
for (let i in States) {
	States[States[i]] = i;
}

class NetworkState {
	constructor(id, ws = null) {
		this.id = id;
		this.ws = ws;
		
		this.toClient = new ProtoDef(false);
		this.toServer = new ProtoDef(false);
		
		this.prevState = null;
		this.nextState = null;
	}

	linkStates(prev, next) {
		this.prevState = prev;
		this.nextState = next;
	}

	upgrade(data, downgrade = false) {
		this.onLeave(false);
		if (downgrade) { // WARN: no null check
			this.prevState.transferConnection(this.ws, data);
		} else {
			this.nextState.transferConnection(this.ws, data);
		}
		this.ws = null;
	}
	
	transferConnection(ws, data) {
		this.ws = ws;
		this.ws.protoState = this;
		this.ws.onmessage = msg => this.onMessage(msg);
		this.onTransfer(data);
	}
	
	deserialize(msg) {
		return this.toClient.parsePacketBuffer("packet", msg).data;
	}
	
	serialize(packet) {
		return this.toServer.createPacketBuffer("packet", packet);
	}
	
	onMessage(msg) {
		msg = msg.data;
		/* If not binary or length is 0 */
		if (!msg.byteLength) {
			this.ws.close();
			return;
		}
		
		var packet;
		try {
			packet = this.deserialize(msg);
		} catch(e) {
			console.log("invalid packet!", e);
			return;
		}
		
		this.onPacket(packet);
	}
	
	onTransfer(data) { } // Called when the socket switches to this state
	
	onPacket(packet) { } // packet is the packet parsed by protodef
	
	onLeave(wasDisconnected) { } // Called when the socket upgrades to another state, or disconnects
}

class LoginState extends NetworkState {
	constructor(ws) {
		super(States.LOGIN, ws);
		
		this.toClient.addProtocol(protoData, ["login", "toClient"]);
		this.toServer.addProtocol(protoData, ["login", "toServer"]);
	}
	
	onTransfer(client, data) {
		console.log('Client transfered to', this.constructor.name);
	}
	
	onPacket(client, packet) {
		console.log(packet);
		switch(packet.name) {
			case "loginStart":
				console.log("BOB ;( " + packet.params.bob);
				break;
		}
	}
	
	onLeave(client, wasDisconnected) {
		console.log('Client closed', wasDisconnected);
	}
}

class PlayState extends NetworkState {
	constructor() {
		super(States.PLAY);
		
		this.toClient.addProtocol(protoData, ["play", "toClient"]);
		this.toServer.addProtocol(protoData, ["play", "toServer"]);
	}
	
	onTransfer(client, data) {
		console.log('Client transfered to', this.constructor.name);
	}
	
	onPacket(client, packet) {
		console.log(packet);
		switch(packet.name) {
			
		}
	}
	
	onLeave(client, wasDisconnected) {
		console.log('Client closed', wasDisconnected);
	}
}

function stateChain(initialState) {
	var states = {};
	const nextState = (currentState, prevState) => {
		states[currentState.id] = currentState;
		return {
			next: state => {
				currentState.linkStates(prevState, state);
				return nextState(state, currentState);
			},
			end: () => {
				currentState.linkStates(prevState, null);
				return {
					initial: initialState,
					byId: states
				};
			}
		};
	};
	return nextState(initialState, null);
}

class ProtocolPDefImpl extends Protocol {
    constructor(ws) {
        super(ws);
		this.states = stateChain(new LoginState(ws))
		                   .next(new PlayState()).end();
		this.hookEvents();
    }
	
	get currentState() {
		return this.ws.protoState;
	}
	
	send(packet) {
		var buf = this.currentState.serialize(packet);
		console.log(buf);
		this.ws.send(buf);
	}

    openHandler() {
		super.openHandler();
		this.states.initial.transferConnection(this.ws);
    }

    closeHandler() {
		super.closeHandler();
        
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
/*
class Protocol {
	constructor(worldManager, loginManager) {
		
	}
	
	onConnection(client) {
	}
	
	onDisconnection(client) {
		client.protoState.onLeave(client, true);
	}
};*/
export const ProtocolPDef = {
	class: ProtocolPDefImpl
};
console.log(protoData, NetworkState, ProtocolPDef, ProtoDef);