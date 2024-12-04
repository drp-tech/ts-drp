import {
	ActionType,
	type DRP,
	type Operation,
	type ResolveConflictsType,
	SemanticsType,
} from "@ts-drp/object";
import { Pixel } from "./pixel";

export class Canvas implements DRP {
	operations: string[] = ["splash", "paint"];
	semanticsType: SemanticsType = SemanticsType.pair;

	width: number;
	height: number;
	canvas: Pixel[][];

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
		this.canvas = Array.from(new Array(width), () =>
			Array.from(new Array(height), () => new Pixel()),
		);
	}

	splash(
		offset: [number, number],
		size: [number, number],
		rgb: [number, number, number],
	): void {
		this._splash(offset, size, rgb);
	}

	paint(offset: [number, number], rgb: [number, number, number]): void {
		this._paint(offset, rgb);
	}

	private _splash(
		offset: [number, number],
		size: [number, number],
		rgb: [number, number, number],
	): void {
		if (offset[0] < 0 || this.width < offset[0]) return;
		if (offset[1] < 0 || this.height < offset[1]) return;

		for (let x = offset[0]; x < this.width || x < offset[0] + size[0]; x++) {
			for (let y = offset[1]; y < this.height || y < offset[1] + size[1]; y++) {
				this.canvas[x][y].paint(rgb);
			}
		}
	}

	private _paint(
		offset: [number, number],
		rgb: [number, number, number],
	): void {
		if (offset[0] < 0 || this.canvas.length < offset[0]) return;
		if (offset[1] < 0 || this.canvas[offset[0]].length < offset[1]) return;

		this.canvas[offset[0]][offset[1]].paint(rgb);
	}

	pixel(x: number, y: number): Pixel {
		return this.canvas[x][y];
	}

	resolveConflicts(_): ResolveConflictsType {
		return { action: ActionType.Nop };
	}

	mergeCallback(operations: Operation[]): void {
		this.canvas = Array.from(new Array(this.width), () =>
			Array.from(new Array(this.height), () => new Pixel()),
		);
		for (const op of operations) {
			if (!op.value) continue;
			switch (op.type) {
				case "splash": {
					const [offset, size, rgb] = op.value;
					this._splash(offset, size, rgb);
					break;
				}
				case "paint": {
					const [offset, rgb] = op.value;
					this._paint(offset, rgb);
					break;
				}
			}
		}
	}
}
