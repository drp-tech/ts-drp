import { ActionType, type IDRP, type ResolveConflictsType, SemanticsType, type Vertex } from "@ts-drp/types";

import { Pixel } from "./pixel";

/**
 * The Canvas DRP object
 */
export class Canvas implements IDRP {
	semanticsType: SemanticsType = SemanticsType.pair;

	width: number;
	height: number;
	canvas: Pixel[][];

	/**
	 * Constructor
	 * @param width - The width of the canvas
	 * @param height - The height of the canvas
	 */
	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
		this.canvas = Array.from(new Array(width), () => Array.from(new Array(height), () => new Pixel()));
	}

	/**
	 * Splash the canvas
	 * @param offset - The offset of the splash
	 * @param size - The size of the splash
	 * @param rgb - The rgb value
	 */
	splash(offset: [number, number], size: [number, number], rgb: [number, number, number]): void {
		if (offset[0] < 0 || this.width < offset[0]) return;
		if (offset[1] < 0 || this.height < offset[1]) return;

		for (let x = offset[0]; x < this.width || x < offset[0] + size[0]; x++) {
			for (let y = offset[1]; y < this.height || y < offset[1] + size[1]; y++) {
				this.canvas[x][y].paint(rgb);
			}
		}
	}

	/**
	 * Paint the canvas
	 * @param offset - The offset of the paint
	 * @param rgb - The rgb value
	 */
	paint(offset: [number, number], rgb: [number, number, number]): void {
		if (offset[0] < 0 || this.canvas.length < offset[0]) return;
		if (offset[1] < 0 || this.canvas[offset[0]].length < offset[1]) return;

		this.canvas[offset[0]][offset[1]].paint(rgb);
	}

	/**
	 * Query the pixel
	 * @param x - The x coordinate
	 * @param y - The y coordinate
	 * @returns The pixel
	 */
	query_pixel(x: number, y: number): Pixel {
		return this.canvas[x][y];
	}

	/**
	 * Resolve conflicts
	 * @param _ - The vertices
	 * @returns The resolve conflicts type
	 */
	resolveConflicts(_: Vertex[]): ResolveConflictsType {
		return { action: ActionType.Nop };
	}
}
