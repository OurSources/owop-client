'use strict';
import { EVENTS as e } from './conf.js';
import { eventSys } from './global.js';
import { mkHTML, loadScript, setCookie } from './util/misc.js';
import { windowSys, GUIWindow, UtilDialog } from './windowsys.js';
import { misc } from './main.js';

const SITEKEY = "6LcgvScUAAAAAARUXtwrM8MP0A0N70z4DHNJh-KI";

function loadCaptcha(onload) {
	if (!window.grecaptcha) {
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
			loadScript("https://www.google.com/recaptcha/api.js?onload=callback&render=explicit");
		}
	} else {
		onload();
	}
}

function requestVerification() {
	windowSys.addWindow(new GUIWindow("Verification needed", {
			centered: true
	}, wdow => {
		var id = grecaptcha.render(wdow.addObj(mkHTML("div", {
			style: "margin: -4px;" /* NOTE: not setting cssText */
		})), {
			theme: "light",
			sitekey: SITEKEY,
			callback: token => {
				eventSys.emit(e.misc.captchaToken, token);
				wdow.close();
			}
		});
		wdow.frame.style.cssText = "";
		wdow.container.style.cssText = "overflow: hidden; background-color: #F9F9F9";
	}));
}

export function loadAndRequestCaptcha() {
	if (misc.showEUCookieNag) {
		windowSys.addWindow(new UtilDialog('Cookie notice',
`This box alerts you that we're going to use cookies!
If you don't accept their usage, disable cookies and reload the page.`, false, () => {
			setCookie('nagAccepted', 'true');
			misc.showEUCookieNag = false;
			loadCaptcha(requestVerification);
		}));
	} else {
		loadCaptcha(requestVerification);
	}
}
