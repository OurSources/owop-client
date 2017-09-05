'use strict';

export const colorUtils = {
	to888: (R, G, B) => [(B * 527 + 23) >> 6, (G * 259 + 33) >> 6, (R * 527 + 23) >> 6],
	to565: (R, G, B) => [(B * 249 + 1014) >> 11, (G * 253 + 505) >> 10, (R * 249 + 1014) >> 11],
	u16_565: (R, G, B) => R << 11 | G << 5 | B,
	u24_888: (R, G, B) => R << 16 | G << 8 | B,
	u32_888: (R, G, B) => colorUtils.u24_888(R, G, B) | 0xFF000000,
	u16_565_to_888: color => {
		const R = ((color & 0b11111) * 527 + 23) >> 6;
		const G = ((color >> 5 & 0b11111) * 527 + 23) >> 6;
		const B = ((color >> 11 & 0b11111) * 527 + 23) >> 6;
		return R << 16 | G << 8 | B;
	},
	arrFrom565: color => [color & 0b11111, color >> 5 & 0b111111, color >> 11 & 0b11111],
	/* Takes an integer, and gives an html compatible color */
	toHTML: color => {
		color = color.toString(16); //(color >> 16 & 0xFF | color & 0xFF00 | color << 16 & 0xFF0000).toString(16);
		return '#' + ('000000' + color).substring(color.length);
	}
};
