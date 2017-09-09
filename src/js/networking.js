'use strict';
import { EVENTS as e, protocol } from './conf.js';
import { eventSys, PublicAPI } from './global.js';

export const netVal = {
	connection: null,
	updateInterval: null
};

export const net = {
	protocol: null,
	isConnected: isConnected,
	connect: connect
};

PublicAPI.net = net;

function isConnected() {
	return net.protocol !== null && net.protocol.isConnected();
}

function connect(server, worldName) {
	eventSys.emit(e.net.connecting, server);
	net.connection = new WebSocket(server.url);
	net.connection.binaryType = "arraybuffer";
	net.protocol = new server.proto.class(net.connection, worldName);
}
