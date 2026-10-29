'use strict';
import { EVENTS as e } from './conf.js';
import { eventSys } from './global.js';
import { mkHTML, loadScript, setCookie } from './util/misc.js';
import { windowSys, GUIWindow, UtilDialog } from './windowsys.js';
import { misc } from './main.js';

// Cloudflare Turnstile site key
const SITEKEY = "0x4AAAAAAFN9CvUSRcovi0IT";

function loadCaptcha(onload) {
	if (!window.turnstile) {
		if (window.callback) {
			/* Hacky solution for race condition */
			window.callback = function() {
				onload();
				this();
			}.bind(window.callback);
		} else {
        	window.callback = function() {
	            delete window.callback;
            	onload();
        	};
        	eventSys.emit(e.misc.loadingCaptcha);
			loadScript("https://challenges.cloudflare.com/turnstile/v0/api.js?onload=callback&render=explicit");
		}
	} else {
		onload();
	}
}

function requestVerification() {
	windowSys.addWindow(new GUIWindow("Verification needed", {
			centered: true
	}, wdow => {
		var id = turnstile.render(wdow.addObj(mkHTML("div", {
			id: "captchawdow"
		})), {
			theme: "light",
			sitekey: SITEKEY,
			callback: token => {
				eventSys.emit(e.misc.captchaToken, token);
				turnstile.remove(id);
				wdow.close();
			}
		});
		wdow.frame.style.cssText = "";
		wdow.container.style.cssText = "overflow: hidden; background-color: #F9F9F9";
	}));
}

export function loadAndRequestCaptcha() {
	if ('owopcaptcha' in localStorage) {
		setTimeout(() => {
			eventSys.emit(e.misc.captchaToken, 'LETMEINPLZ' + localStorage.owopcaptcha);
		}, 0);
	} else {
		loadCaptcha(requestVerification);
	}
}
