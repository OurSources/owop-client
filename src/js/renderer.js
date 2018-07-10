"use strict";

class Camera {
	constructor(x, y, zoom) {
		this.x = x || 0;
		this.y = y || 0;
		this.zoom = zoom || 0;
	}
}

export class Renderer {
	constructor(viewport) {
		this.viewport = viewport;

		this.chunkContainer = document.createElement("div");

	}
}