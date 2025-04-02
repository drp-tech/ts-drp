import { type IDRP, SemanticsType } from "@ts-drp/types";

/**
 * SetDRP is a class that implements a set of values.
 * @template T - The type of values in the set
 */
export class SetDRP<T> implements IDRP {
	semanticsType = SemanticsType.pair;

	private _set: Set<T>;

	/**
	 * Constructor for SetDRP
	 */
	constructor() {
		this._set = new Set();
	}

	/**
	 * Add a value to the set
	 * @param value - The value to add to the set
	 */
	add(value: T): void {
		this._set.add(value);
	}

	/**
	 * Delete a value from the set
	 * @param value - The value to delete from the set
	 */
	delete(value: T): void {
		this._set.delete(value);
	}

	/**
	 * Check if the set contains a value
	 * @param value - The value to check for in the set
	 * @returns True if the value is in the set, false otherwise
	 */
	query_has(value: T): boolean {
		return this._set.has(value);
	}

	/**
	 * Get all values in the set
	 * @returns An array of all values in the set
	 */
	query_getValues(): T[] {
		return Array.from(this._set.values());
	}
}
