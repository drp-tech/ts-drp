import { SemanticsType, type IDRP } from "@ts-drp/types";

export class SetDRP<T> implements IDRP {
	semanticsType = SemanticsType.pair;

	private _set: Set<T>;

	constructor() {
		this._set = new Set();
	}

	add(value: T): void {
		this._set.add(value);
	}

	delete(value: T): void {
		this._set.delete(value);
	}

	query_has(value: T): boolean {
		return this._set.has(value);
	}

	query_getValues(): T[] {
		return Array.from(this._set.values());
	}
}
