'use strict';
import { OldProtocol } from './old.js';
import { ProtocolPDef } from './protodef.js';
import { options } from './../conf.js';

export const definedProtos = {
	'old': OldProtocol,
	'protodef': ProtocolPDef
};

export function resolveProtocols() {
	var server = options.serverAddress;
	server.proto = definedProtos[server.proto];
}
