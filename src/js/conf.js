"use strict";
import { eventSys, PublicAPI } from './global.js';
import { propertyDefaults, storageEnabled } from './util/misc.js';
import toolSet from '../img/toolset.png';
import unloadedPat from '../img/unloaded.png';

/* Important constants */

export let protocol = null;

/* The raw event ID numbers should NOT be used, instead import the EVENTS object in your file. */
let evtId = 6666666; /* no */

export const RANK = {
	NONE: 0,
	USER: 1,
	MODERATOR: 2,
	ADMIN: 3
};

PublicAPI.RANK = RANK;

export const EVENTS = {
	loaded: ++evtId,
	init: ++evtId,
	tick: ++evtId,
	misc: {
		toolsRendered: ++evtId,
		toolsInitialized: ++evtId,
		logoMakeRoom: ++evtId,
		worldInitialized: ++evtId,
		windowAdded: ++evtId,
		captchaToken: ++evtId
	},
	renderer: {
		addChunk: ++evtId,
		rmChunk: ++evtId,
		updateChunk: ++evtId
	},
	camera: {
		moved: ++evtId,
		zoom: ++evtId /* (zoom value), note that this event should not be used to SET zoom level. */
	},
	net: {
		connecting: ++evtId,
		connected: ++evtId,
		disconnected: ++evtId,
		playerCount: ++evtId,
		chat: ++evtId,
		devChat: ++evtId,
		world: {
			leave: ++evtId,
			join: ++evtId, /* (worldName string) */
			joining: ++evtId, /* (worldName string) */
			setId: ++evtId,
			playersMoved: ++evtId, /* (Object with all the updated player values) */
			playersLeft: ++evtId,
			tilesUpdated: ++evtId,
			teleported: ++evtId
		},
		chunk: {
			load: ++evtId, /* (Chunk class) */
			unload: ++evtId, /* (x, y) */
			set: ++evtId, /* (x, y, data), backwards compat */
			lock: ++evtId
		},
		sec: {
			rank: ++evtId
		}
	}
};

export const PUBLIC_EVENTS = {
	loaded: EVENTS.loaded,
	init: EVENTS.init,
	tick: EVENTS.tick,
	toolsInitialized: EVENTS.misc.toolsInitialized
};

PublicAPI.events = PUBLIC_EVENTS;

let userOptions = {};
if (storageEnabled()) {
	try {
		userOptions = JSON.parse(localStorage.getItem('owopOptions') || '{}');
	} catch (e) {
		console.error('Error while parsing user options!', e);
	}
}

export const options = propertyDefaults(userOptions, {
	serverAddress: `ws://${location.hostname}:${location.hostname === 'ourworldofpixels.com' ? 443 : 9000}`, // The server address that websockets connect to
	fallbackFps: 30, // Fps used if requestAnimationFrame is not supported
	maxChatBuffer: 256, // How many chat messages to retain in the chatbox
	tickSpeed: 30, // How many times per second to run a tick
	minGridZoom: 1, /* Minimum zoom level where the grid shows up */
	movementSpeed: 1, /* Pixels per tick */
	defaultWorld: 'main',
	enableSounds: true,
	defaultZoom: 16,
	zoomStrength: 1,
	zoomLimitMin: 1,
	zoomLimitMax: 32,
	unloadDistance: 10,
	toolSetUrl: toolSet,
	unloadedPatternUrl: unloadedPat,
	backgroundUrl: null,
	/* Bug only affects Windows users with an Intel graphics card,
	 * since we can't easily know the client's GPU,
	 * activate for all windows users ¯\_(ツ)_/¯
	 */
	chunkBugWorkaround: false // navigator.userAgent.indexOf('Windows NT') !== -1
	/* Did it get fixed? we'll know soon! */
});

if (options.chunkBugWorkaround) {
	console.debug('Chunk bug workaround enabled!');
}

PublicAPI.options = options;

eventSys.on(EVENTS.net.connecting, server => {
	protocol = server.proto;
});
