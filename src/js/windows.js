"use strict";

export class Window {
	constructor(options) {
		this.name; // Unique backend name

		this.title = options.title || "";
		this.shownOn = null; // holds a ref to the wm if shown

		this.x = options.x || 0;
		this.y = options.y || 0;

		this.width = options.width || 200;
		this.height = options.height || 200;

		// Is there a prettier way to do this lol?
		this.elements = {};
		this.element = document.createElement("div");
		this.element.className = "closeable";

		// Resize handles
		this.elements.resize = document.createElement("div");
		this.elements.resize.className = "resize";
		["n", "nw", "w", "sw", "s", "se", "e", "ne"].forEach((direction) => {
			let handle = document.createElement("div");
			handle.className = direction;
			this.elements.resize.appendChild(handle);
		});
		this.elements.resize.addEventListener("mousedown", (event) => {
			if (event.target == this.elements.resize) {
				return;
			}

			let direction = event.target.className;

			let startX = event.pageX;
			let startY = event.pageY;
			let startTop = this.y;
			let startLeft = this.x;
			let startHeight = this.height;
			let startWidth = this.width;

			let mouseMove = function(event) {
				let deltaY = event.pageY - startY;
				let deltaX = event.pageX - startX;

				let deltaLeft = 0;
				let deltaTop = 0;
				let deltaWidth = 0;
				let deltaHeight = 0;

				if (direction.includes("s")) {
					deltaHeight = deltaY;
				} else if (direction.includes("n")) {
					deltaTop = Math.min(deltaY, (startTop + startHeight - this.maxHeight) - startTop);
					deltaHeight = -deltaY;
				}

				if (direction.includes("e")) {
					deltaWidth = deltaX;
				} else if(direction.includes("w")) {
					deltaLeft = Math.min(deltaX, (startLeft + startWidth - this.maxWidth) - startLeft);
					deltaWidth = -deltaX;
				}

				this.move(
					startLeft + deltaLeft,
					startTop + deltaTop
				);
				this.resize(
					startWidth + deltaWidth,
					startHeight + deltaHeight
				);
			}.bind(this);
			function mouseUp() {
				window.removeEventListener("mousemove", mouseMove);
				window.removeEventListener("mouseup", mouseUp);
			}

			window.addEventListener("mousemove", mouseMove);
			window.addEventListener("mouseup", mouseUp);
		});
		this.element.appendChild(this.elements.resize);

		this.elements.head = document.createElement("div");
		this.elements.head.className = "head";
		this.elements.head.addEventListener("mousedown", (event) => {
			let offsetX = event.pageX - this.x;
			let offsetY = event.pageY - this.y;

			let mouseMove = function(event) {
				this.move(
					event.pageX - offsetX,
					event.pageY - offsetY
				);
			}.bind(this);
			function mouseUp() {
				window.removeEventListener("mousemove", mouseMove);
				window.removeEventListener("mouseup", mouseUp);
			}

			window.addEventListener("mousemove", mouseMove);
			window.addEventListener("mouseup", mouseUp);
		});

		this.elements.title = document.createElement("span");
		this.elements.title.className = "title";
		this.elements.title.innerText = this.title;
		this.elements.head.appendChild(this.elements.title);

		this.elements.close = document.createElement("button");
		this.elements.close.className = "close";
		this.elements.close.addEventListener("click", () => {
			this.close();
		});
		this.elements.head.appendChild(this.elements.close);
		this.element.appendChild(this.elements.head);

		this.elements.body = document.createElement("div");
		this.elements.body.className = "body";
		this.elements.body.appendChild(options.content);
		this.element.appendChild(this.elements.body);


		this.move(this.x, this.y);
		this.resize(this.width, this.height);
	}

	get maxWidth() {
		return 100;
	}
	get maxHeight() {
		return 40;
	}

	close() {
		//if (this.shownOn) { // just throw if not shown lol
			this.shownOn.rmWindow(this);
		//}
	}

	move(x, y) {
		//var csize = this.shownOn.getContainerSize();
		//this.x = Math.min(Math.max(x, x - this.width + 20), csize.w - 20);
		//this.y = Math.min(Math.max(y, y - this.height + 20), csize.h - 20);
		let margin = 6;
		this.x = Math.max(Math.min(x, window.innerWidth - this.width - margin), margin);
		this.y = Math.max(Math.min(y, window.innerHeight - this.height - margin), margin);
		this.element.style.top = this.y + "px";
		this.element.style.left = this.x + "px";
	}

	resize(w, h) {
		this.width = Math.max(w, this.maxWidth);
		this.height = Math.max(h, this.maxHeight);
		this.element.style.width = this.width + "px";
		this.element.style.height = this.height + "px";
	}
}

class ToolWindow extends Window {
	constructor(availableTools) { // [Tool...]
		super("Tools");
	}

	resize(width, height) {
		// Snap to tool icon size
		this.width = Math.floor(width / 16);
		this.height = Math.floor(height / 16);
	}
}

export class WindowManager {
	constructor(containerDiv) {
		this.div = containerDiv;
		this.windows = [];
	}

	getWindowByTitle(title) {
		return this.windows.find(win => win.title === title);
	}

	add(win) {
		this.windows.push(win);
		this.div.appendChild(win.element);
		win.shownOn = this;
		//win.move(win.x, win.y); // in case it is out of the screen?
	}

	remove(win) {
		win.shownOn = null;
		this.div.removeChild(win);
		return this.windows.remove(win);
	}

	getContainerSize() {
		return {
			w: this.div.clientWidth,
			h: this.div.clientHeight
		};
	}
}