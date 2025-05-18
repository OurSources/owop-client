"use strict";

var shown = false;
var contextMenu = document.createElement("div");
contextMenu.className = "context-menu";

function removeMenu(event) {
		document.body.removeChild(contextMenu);
		document.removeEventListener("click", removeMenu);
		shown = false;
}

export function createContextMenu(x, y, buttons) {
	if (shown) {
		removeMenu();
	}

	contextMenu.innerHTML = "";
	for (var i=0; i<buttons.length; i++) {
		var button = document.createElement("button");
		button.textContent = buttons[i][0];
		button.addEventListener("click", buttons[i][1]);
		contextMenu.appendChild(button);
	}
	document.body.appendChild(contextMenu);
	shown = true;
	var height = contextMenu.offsetHeight;
	console.log(height);
	if (y + height > window.innerHeight - 20) {
		contextMenu.style.top = (y - height) + "px";
	} else {
		contextMenu.style.top = y + "px";
	}
	contextMenu.style.left = x + "px";

	document.addEventListener("click", removeMenu);
}