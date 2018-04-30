"use strict";

export class LoadScreen {
	constructor(status, msg) {
		this.status = status;
		this.msg = msg;
	}
	
	setVisible(visible) {
		
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
