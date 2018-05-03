"use strict";

import constants from 'constants.json';

const fl = Math.floor;

export default class World {
	constructor() {
		this.chunks = new Map();
		this.players = new Map();
	}
	
	static getChunkKey(x, y) {
		/* If the chunk position is signed 24-bit (or less), it actually fits in a js number */
		/* >>> 0 'casts' to unsigned, * 0x1000000 shifts the num 24 bits */
		return ((x >>> 0 & 0xFFFFFF) * 0x1000000 + (y >>> 0 & 0xFFFFFF));
	}
	
	getChunk(x, y) {
		return this.chunks.get(World.getChunkKey(x, y));
	}
	
	getPixel(x, y) {
		const chunk = this.getChunk(fl(x / constants.chunkSize), fl(y / constants.chunkSize));
		return chunk;
	}
}
