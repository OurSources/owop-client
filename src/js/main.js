"use strict";

import "babel-polyfill";

import compat from "./compat";

import { LoadScreen } from "./load-screen";

import Networking from "./networking";

class Game {
	constructor() {
		this.loadScreen = new LoadScreen(
			document.getElementById("load-status"),
			document.getElementById("load-msg")
		);
		
		this.loadScreen.setMessage("Loading...", true);
		
		this.loadScreen.setMessage("Initializing...", true);
		
		this.net = new Networking("ws://localhost:9000", "main");
		
		this.world = null;
	}
}

window.addEventListener("load", async function() {
	await compat();
	
	window.Game = new Game();
});

window.captchaSubmit = function(token) {
	window.Game.net.loginGuest(token);
};
