/**
 * The Pixel DRP object
 */
export class Pixel {
	red: number;
	green: number;
	blue: number;

	/**
	 * Constructor
	 * @param red - The red value
	 * @param green - The green value
	 * @param blue - The blue value
	 */
	constructor(red?: number, green?: number, blue?: number) {
		this.red = red ?? 0;
		this.green = green ?? 0;
		this.blue = blue ?? 0;
	}

	/**
	 * Get the color of the pixel
	 * @returns The color of the pixel
	 */
	color(): [number, number, number] {
		return [this.red % 256, this.green % 256, this.blue % 256];
	}

	/**
	 * Get the counters of the pixel
	 * @returns The counters of the pixel
	 */
	counters(): [number, number, number] {
		return [this.red, this.green, this.blue];
	}

	/**
	 * Paint the pixel
	 * @param rgb - The rgb value
	 */
	paint(rgb: [number, number, number]): void {
		this.red += rgb[0];
		this.green += rgb[1];
		this.blue += rgb[2];
	}
}
