const colorMap: Map<string, string> = new Map();

/**
 * Convert RGB to HSL
 * @param rInt - The red value
 * @param gInt - The green value
 * @param bInt - The blue value
 * @returns The HSL values
 */
export const rgbToHsl = (rInt: number, gInt: number, bInt: number): [number, number, number] => {
	const r = rInt / 255;
	const g = gInt / 255;
	const b = bInt / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	let s: number;
	const l = (max + min) / 2; // Initialize h with a default value

	if (max === min) {
		h = s = 0; // achromatic
	} else {
		const chromaticity = max - min;
		s = l > 0.5 ? chromaticity / (2 - max - min) : chromaticity / (max + min);
		switch (max) {
			case r:
				h = (g - b) / chromaticity + (g < b ? 6 : 0);
				break;
			case g:
				h = (b - r) / chromaticity + 2;
				break;
			case b:
				h = (r - g) / chromaticity + 4;
				break;
		}
		h /= 6;
	}
	return [h * 360, s, l];
};

/**
 * Convert HSL to RGB
 * @param h - The hue value
 * @param s - The saturation value
 * @param l - The lightness value
 * @returns The RGB values
 */
export const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
	let r: number;
	let g: number;
	let b: number;

	if (s === 0) {
		r = g = b = l; // achromatic
	} else {
		const hue2rgb = (p: number, q: number, t_: number): number => {
			let t = t_;
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		};

		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		r = hue2rgb(p, q, h / 360 + 1 / 3);
		g = hue2rgb(p, q, h / 360);
		b = hue2rgb(p, q, h / 360 - 1 / 3);
	}

	return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};

/**
 * Convert RGB to hex
 * @param r - The red value
 * @param g - The green value
 * @param b - The blue value
 * @returns The hex value
 */
export const rgbToHex = (r: number, g: number, b: number): string => {
	return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

const hashCode = (str: string): number => {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0; // Convert to 32bit integer
	}
	return hash;
};

/**
 * Get the color for a peer id
 * @param id - The peer id
 * @returns The color
 */
export const getColorForPeerId = (id: string): string => {
	if (!colorMap.has(id)) {
		const hash = hashCode(id);
		let r = (hash & 0xff0000) >> 16;
		let g = (hash & 0x00ff00) >> 8;
		let b = hash & 0x0000ff;

		// Convert to HSL and adjust lightness to be below 50%
		// eslint-disable-next-line prefer-const
		let [h, s, l] = rgbToHsl(r, g, b);
		l = l * 0.5; // Set lightness to below 50%

		// Convert back to RGB
		[r, g, b] = hslToRgb(h, s, l);
		const color = rgbToHex(r, g, b); // Convert RGB to hex
		colorMap.set(id, color);
	}
	return colorMap.get(id) || "#000000";
};

// Helper function to convert hex color to rgba
/**
 * Convert hex to rgba
 * @param hex - The hex value
 * @param alpha - The alpha value
 * @returns The rgba value
 */
export function hexToRgba(hex: string, alpha: number): string {
	const bigint = Number.parseInt(hex.slice(1), 16);
	const r = (bigint >> 16) & 255;
	const g = (bigint >> 8) & 255;
	const b = bigint & 255;
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
