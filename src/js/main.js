"use strict";

import "babel-polyfill";

import compat from "./compat";

import { LoadScreen } from "./load-screen";

import Networking from "./networking";

import { Window, WindowManager } from "./windows";

import { Renderer } from "./renderer";

class Game {
	constructor() {
		this.loadScreen = new LoadScreen(
			document.getElementById("load-screen"),
			document.getElementById("load-status"),
			document.getElementById("load-msg")
		);
		this.loadScreen.setMessage("Loading...", true);

		this.windowManager = new WindowManager(
			document.getElementById("windows")
		);

		this.windowManager.add(new Window({
			title: "Test",
			x: 32,
			y: 32,
			width: 300,
			height: 100,
			content: document.createElement("div")
		}));

		this.renderer = new Renderer(
			document.getElementById("viewport")
		);

		this.loadScreen.setMessage("Initializing...", true);

		this.net = new Networking("ws://localhost:9000", "main");

		this.loadScreen.setVisible(false);

		this.net.on("clientData", () => {
			this.loadScreen.setVisible(false);
		});

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
