"use strict";

export class LoadScreen {
	constructor(screen, status, msg) {
		this.screen = screen;
		this.status = status;
		this.msg = msg;
	}
	
	setVisible(visible) {
		if (visible) {
			this.screen.classList.remove("hide");
		} else {
			this.screen.classList.add("hide");
		}
	}
	
	setMessage(message, showSpinner) {
		if (message === null) {
			this.status.classList.add("hidden");
			return;
		} else {
			this.status.classList.remove("hidden");
		}
		
		if (showSpinner) {
			this.status.classList.add("spinner");
		} else {
			this.status.classList.remove("spinner");
		}
		
		this.msg.innerHTML = message;
	}
}
