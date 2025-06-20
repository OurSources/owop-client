import { GUIWindow, windowSys } from "./windowsys";
import { waitFrames } from "./util/misc";

export default class ColorPicker {
	#wasConfirmed = false;
	#movefunc = null;
	self = null;
	selfw = null;
	container = null;
	canvas = null;
	#ctx = null;
	sCanvas = null;
	#sCtx = null;
	#cc = null;
	cHandle = null;
	sHandle = null;
	#internalOnChange = null;
	// defaults
	options = {
		startColor: {
			h: 0,
			s: 1,
			l: 0.5,
			str: 'hsl(0, 100%, 50%)'
		},
		anchorPreset: 'left',
		onChange: null,
		onSelect: null,
		onCancel: null,
		onClose: null,
		parentElement: null,
		closeable: true,
		draggable: true,
	};
	/**
	  * @constructor
	  * @param {object} options - options for how it should behave
	* @param {HTMLElement|undefined} options.parentElement - the element to bind to
	* @param {string|undefined} options.startColor - the color to start on
	* @param {string|undefined} options.anchorPreset - which side to appear on ("left" or "right")
	* @param {void} options.onChange - callback for when color changes
	* @param {void} options.onSelect - callback for when finishing color selection
	* @param {void} options.onCancel - callback for when cancelling color selection
	* @param {void} options.onClose - callback for when the color selector closes, runs before it is destroyed.
	  */
	constructor(options) {
		if (!!options) {
			if (options.startColor) options.startColor = this.#parseColor(options.startColor);
		}
		this.options = { ...this.options, ...options };
		this.#init();
	}

	#parseColor = str => {
		console.log(str);
		const defaultClr = { h: 0, s: 1, l: 0.5, str: 'hsl(0, 100%, 50%)' };
		if (!this.#isValidColor(str)) return defaultClr;
		const { r, g, b, a } = this.#normalizeColorToRGBA(str);

		const rn = r / 255;
		const gn = g / 255;
		const bn = b / 255;
		const max = Math.max(rn, gn, bn);
		const min = Math.min(rn, gn, bn);
		const delta = max - min;

		let h = 0, s = 0, l = (max + min) / 2;

		if (delta !== 0) {
			s = l < 0.5 ? delta / (max + min) : delta / (2 - max - min);

			switch (max) {
				case rn: h = (gn - bn) / delta + (gn < bn ? 6 : 0); break;
				case gn: h = (bn - rn) / delta + 2; break;
				case bn: h = (rn - gn) / delta + 4; break;
			}

			h *= 60;
		}

		return {
			h,
			s,
			l,
			str: `hsl(${Math.round(h)}, ${(s * 100).toFixed(1)}%, ${(l * 100).toFixed(1)}%)`
		}
	}

	#normalizeColorToRGBA = (colorStr) => {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const ctx = canvas.getContext('2d');

		ctx.clearRect(0, 0, 1, 1);
		ctx.fillStyle = '#000'; // fallback
		ctx.fillStyle = colorStr;
		ctx.fillRect(0, 0, 1, 1);
		const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;

		return { r, g, b, a: +(a / 255).toFixed(3) };
	};

	hslToRgb(h, s, l) {
		let c = (1 - Math.abs(2 * l - 1)) * s;
		let x = c * (1 - Math.abs((h / 60) % 2 - 1));
		let m = l - c / 2;
		let r = 0, g = 0, b = 0;

		if (h < 60) [r, g, b] = [c, x, 0];
		else if (h < 120) [r, g, b] = [x, c, 0];
		else if (h < 180) [r, g, b] = [0, c, x];
		else if (h < 240) [r, g, b] = [0, x, c];
		else if (h < 300) [r, g, b] = [x, 0, c];
		else[r, g, b] = [c, 0, x];

		r = Math.round((r + m) * 255);
		g = Math.round((g + m) * 255);
		b = Math.round((b + m) * 255);

		return { r, g, b };
	}

	rgbToHex(r, g, b) {
		return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
	}

	parseHSLString(str) {
		const match = str.match(/hsl\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)%,\s*(\d+(?:\.\d+)?)%\)/);
		if (!match) {
			console.warn("Invalid HSL color:", str);
			return { h: 0, s: 1, l: 0.5, str: "hsl(0, 100%, 50%)" };
		}
		const [, h, s, l] = match.map(Number);
		return {
			h,
			s: s / 100,
			l: l / 100,
			str
		};
	}

	getSelectedColor = () => {
		const x = this.cHandle.offsetLeft + this.cHandle.offsetWidth / 2;
		const y = this.cHandle.offsetTop + this.cHandle.offsetHeight / 2;
		const w = this.canvas.clientWidth;
		const h = this.canvas.clientHeight;

		const hue = ((this.sHandle.offsetTop + this.sHandle.offsetHeight / 2) / this.sCanvas.clientHeight) * 360;
		const sat = x / w;
		const brightness = 1 - (y / h);

		return {
			h: hue,
			s: sat,
			l: brightness / 2 * (2 - sat),
			str: `hsl(${hue.toFixed(0)},${(sat * 100).toFixed(1)}%, ${(brightness * 50).toFixed(1)}%)`
		};
	}

	canvasListeners = (which, toggle) => {
		let handle;
		if (which === this.canvas) handle = this.cHandle;
		else if (which === this.sCanvas) handle = this.sHandle;
		else return;
		const cClickListener = e => {
			const crect = which.getBoundingClientRect();
			const x = e.clientX - crect.left;
			const y = e.clientY - crect.top;

			const hw = handle.offsetWidth / 2;
			const hh = handle.offsetHeight / 2;
			if (which === this.canvas) handle.style.left = `${Math.max(-hw, Math.min(x - hw, which.clientWidth - hw))}px`;
			handle.style.top = `${Math.max(-hh, Math.min(y - hh, which.clientHeight - hh))}px`;
			const clr = this.getSelectedColor();
			this.#cc = clr;

			this.canvas.update();
			this.sCanvas.update();
			
			if(this.#internalOnChange) this.#internalOnChange(clr);

			handle.isDragging = true;
			handle.ox = handle.offsetHeight / 2;
			handle.oy = handle.offsetHeight / 2;
			handle.classList.add('picker-dragging');
			this.self.classList.add('picker-dragging');
		}

		if (toggle) which.addEventListener("mousedown", cClickListener);
		else which.removeEventListener("mousedown", cClickListener);
	}

	handleListeners = (which, toggle) => {
		const handleDownFunc = (e) => {
			which.isDragging = true;
			which.ox = e.offsetX;
			which.oy = e.offsetY;
			which.classList.add('picker-dragging');
			this.self.classList.add('picker-dragging');
		}

		const handleMoveFunc = (e) => {
			if (!which.isDragging) return;
			const crect = this.canvas.getBoundingClientRect();
			const nx = e.clientX - crect.left - which.ox;
			const ny = e.clientY - crect.top - which.oy;

			if (which === this.cHandle) {
				const mx = this.canvas.clientWidth - which.offsetWidth / 2;
				const my = this.canvas.clientHeight - which.offsetHeight / 2;
				which.style.left = Math.max(-which.offsetWidth / 2, Math.min(nx, mx)) + "px";
				which.style.top = Math.max(-which.offsetHeight / 2, Math.min(ny, my)) + "px";
			} else if (which === this.sHandle) {
				const my = this.sCanvas.clientHeight - which.offsetHeight / 2;
				which.style.top = Math.max(-which.offsetHeight / 2, Math.min(ny, my)) + "px";
			}

			const clr = this.getSelectedColor();
			this.#cc = clr;

			this.canvas.update();
			this.sCanvas.update();
			if (this.options.onChange) this.options.onChange(clr);
			if(this.#internalOnChange) this.#internalOnChange(clr);
		}

		const handleUpFunc = (e) => {
			which.isDragging = false;
			which.ox = 0;
			which.oy = 0;
			which.classList.remove('picker-dragging');
			this.self.classList.remove('picker-dragging');
		}

		if (toggle) {
			which.addEventListener("mousedown", handleDownFunc);
			document.addEventListener("mousemove", handleMoveFunc);
			document.addEventListener("mouseup", handleUpFunc);
		} else {
			which.removeEventListener("mousedown", handleDownFunc);
			document.removeEventListener("mousemove", handleMoveFunc);
			document.removeEventListener("mouseup", handleUpFunc);
		}
	}

	#isValidColor = str => {
		let s = new Option().style;
		s.color = str;
		return s.color !== '';
	}

	#init() {
		// this.self = document.createElement('div');
		this.selfw = windowSys.addWindow(new GUIWindow("Color Picker", { centerOnce: !this.options.parentElement, closeable: this.options.closeable }));
		waitFrames(0, ()=>{
			if(this.options.parentElement) {
				if(this.options.anchorPreset === 'left'){
					this.#movefunc = ()=> {
						this.selfw.opt.immobile = false;
						this.selfw.move(this.options.parentElement.getBoundingClientRect().left - this.selfw.frame.offsetWidth - 8, this.options.parentElement.getBoundingClientRect().top);
						this.selfw.opt.immobile = !this.options.draggable;
					}
				}
				this.#movefunc();
				window.addEventListener('resize', this.#movefunc);
			}
			this.selfw.opt.immobile = !this.options.draggable;
		});
		this.self = this.selfw.container;
		this.container = document.createElement('div');
		this.canvas = document.createElement('canvas');
		this.canvas.classList.add('color-picker-canvas');
		this.sCanvas = document.createElement('canvas');
		this.sCanvas.classList.add('color-picker-slider');
		this.#ctx = this.canvas.getContext('2d');
		this.#sCtx = this.sCanvas.getContext('2d');

		this.cw = document.createElement('div');
		this.sw = document.createElement('div');
		this.cw.style.position = 'relative';
		this.sw.style.position = 'relative';
		// this.cw.style.flex = '1';
		// this.sw.style.flex = '0 0 10px'; // matches your .color-picker-slider width
		this.container.appendChild(this.cw);
		this.container.appendChild(this.sw);

		console.log(this.options.startColor);
		this.#cc = this.options.startColor;

		this.cw.appendChild(this.canvas);
		this.sw.appendChild(this.sCanvas);
		this.self.appendChild(this.container);
		this.canvas.update = () => {
			const w = this.canvas.width;
			const h = this.canvas.height;
			const clr = `hsl(${this.#cc.h}, 100%, 50%)`;
			const hg = this.#ctx.createLinearGradient(0, 0, w, 0);
			hg.addColorStop(0, "white");
			hg.addColorStop(1, clr);
			this.#ctx.fillStyle = hg;
			this.#ctx.fillRect(0, 0, w, h);

			const vg = this.#ctx.createLinearGradient(0, 0, 0, h);
			vg.addColorStop(0, "rgba(0,0,0,0)");
			vg.addColorStop(1, "rgba(0,0,0,1)");
			this.#ctx.fillStyle = vg;
			this.#ctx.fillRect(0, 0, w, h);
		}
		this.sCanvas.update = () => {
			const w = this.sCanvas.width;
			const h = this.sCanvas.height;
			const vg = this.#sCtx.createLinearGradient(0, 0, 0, h);

			const steps = 360; // 1 per hue degree for smoothness
			for (let i = 0; i <= steps; i++) {
				const hue = (i / steps) * 360;
				vg.addColorStop(i / steps, `hsl(${hue}, 100%, 50%)`);
			}
			this.#sCtx.fillStyle = vg;
			this.#sCtx.fillRect(0, 0, w, h);
		}
		// this.self.classList.add('color-picker-frame');
		this.container.style.padding = '8px';
		this.container.classList.add('color-picker-container');

		this.cHandle = document.createElement('div');
		this.cHandle.isDragging = false;
		this.cHandle.ox = 0;
		this.cHandle.oy = 0;
		this.cHandle.classList.add('draggableHandle');
		this.handleListeners(this.cHandle, true);
		this.sHandle = document.createElement('div');
		this.sHandle.isDragging = false;
		this.sHandle.ox = 0;
		this.sHandle.oy = 0;
		this.sHandle.classList.add('draggableHandle');
		this.handleListeners(this.sHandle, true);

		this.canvasListeners(this.canvas, true);
		this.canvasListeners(this.sCanvas, true);

		this.cw.appendChild(this.cHandle);
		this.sw.appendChild(this.sHandle);

		this.canvas.update();
		this.sCanvas.update();

		const canvasW = this.canvas.clientWidth;
		const canvasH = this.canvas.clientHeight;
		const sliderH = this.sCanvas.clientHeight;

		const b = this.#cc.l * 2 / (2 - this.#cc.s);
		const y = (1 - b) * canvasH;
		const x = this.#cc.s * canvasW;
		const hueY = (this.#cc.h / 360) * sliderH;

		this.cHandle.style.left = `${x - this.cHandle.offsetWidth / 2}px`;
		this.cHandle.style.top = `${y - this.cHandle.offsetHeight / 2}px`;
		this.sHandle.style.top = `${hueY - this.sHandle.offsetHeight / 2}px`;

		this.self.classList.add('whitetext');

		const bottom = document.createElement('div');
		bottom.style.display = 'flex';
		bottom.style.flexDirection = 'row';
		bottom.style.alignItems = 'center';
		const outputText = document.createElement('div');
		outputText.style.flex = '1';
		const rgb = this.hslToRgb(this.#cc.h, this.#cc.s, this.#cc.l);
		const preview = document.createElement('div');
		preview.style.backgroundColor = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
		preview.style.height='20px';
		preview.style.width='20px';
		preview.style.marginRight='8px';
		outputText.innerText = this.rgbToHex(rgb.r, rgb.g, rgb.b);
		const submit = document.createElement('button');
		submit.style.cursor = 'pointer';
		submit.innerHTML = 'Confirm';

		this.#internalOnChange = ()=>{
			const rgb = this.hslToRgb(this.#cc.h, this.#cc.s, this.#cc.l);
			preview.style.backgroundColor = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
			outputText.innerText = this.rgbToHex(rgb.r, rgb.g, rgb.b);
		}

		submit.onclick = () => {
			this.#wasConfirmed = true;
			if (this.options.onSelect) this.options.onSelect(this.#cc);
			this.selfw.close();
		}

		bottom.appendChild(preview);
		bottom.appendChild(outputText);
		bottom.appendChild(submit);
		this.self.appendChild(bottom);

		this.selfw.onclose = () => {
			this.canvasListeners(this.canvas, false);
			this.canvasListeners(this.sCanvas, false);
			this.handleListeners(this.cHandle, false);
			this.handleListeners(this.sHandle, false);
			if (!this.#wasConfirmed && this.options.onCancel) this.options.onCancel();
			if (this.options.onClose) this.options.onClose();
			if (this.#movefunc) window.removeEventListener('resize', this.#movefunc);
		}
	}
}