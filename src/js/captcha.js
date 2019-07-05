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
        	eventSys.emit(e.misc.loadingCaptcha);
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
			id: "captchawdow"
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
	if ('owopcaptcha' in localStorage) {
		setTimeout(() => {
			eventSys.emit(e.misc.captchaToken, 'LETMEINPLZ' + localStorage.owopcaptcha);
		}, 0);
	} else {
		loadCaptcha(requestVerification);
	}
}
