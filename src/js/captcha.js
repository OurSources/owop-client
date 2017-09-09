'use strict';
import { EVENTS as e } from './conf.js';
import { eventSys } from './global.js';
import { mkHTML, loadScript } from './util/misc.js';
import { windowSys, GUIWindow } from './windowsys.js';

const SITEKEY = "6LcgvScUAAAAAARUXtwrM8MP0A0N70z4DHNJh-KI";

function loadCaptcha(onload) {
	if (!window.grecaptcha) {
        /* Race condition here, when calling loadCaptcha more than once */
        window.callback = function() {
            delete window.callback;
            onload();
        };
		loadScript("https://www.google.com/recaptcha/api.js?onload=callback&render=explicit");
	} else {
		onload();
	}
}

function requestVerification() {
	windowSys.addWindow(new GUIWindow("Verification needed", {
			centered: true
	}, wdow => {
		var id = grecaptcha.render(wdow.addObj(mkHTML("div", {
			style: "margin: -4px;"
		})), {
			theme: "light",
			sitekey: SITEKEY,
			callback: e => {
				eventSys.emit(e.misc.captchaToken, e);
				wdow.close();
			}
		});
		wdow.frame.style = "";
		wdow.container.style = "overflow: hidden; background-color: #F9F9F9";
	}));
}

export function loadAndRequestCaptcha() {
    loadCaptcha(requestVerification);
}
