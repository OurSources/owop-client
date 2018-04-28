'use strict';
import { Protocol } from './protocol.js';

export const net = {
	protocol: null,
	isConnected: isConnected,
	connect: connect
};

function isConnected() {
	return net.protocol !== null && net.protocol.isConnected();
}

function connect(serverAddress, worldName) {
	net.protocol = new Protocol(serverAddress, worldName);
}
