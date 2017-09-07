'use strict';
import { OldProtocol } from './old.js';
import { options } from './../conf.js';

export const definedProtos = {
	'old': OldProtocol
};

export function resolveProtocols() {
	for (var i = 0; i < options.serverAddress.length; i++) {
		var server = options.serverAddress[i];
		server.proto = definedProtos[server.proto];
	}
}