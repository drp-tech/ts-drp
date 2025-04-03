import { ActionType, type IDRP, type ResolveConflictsType, SemanticsType } from "@ts-drp/types";

/**
 * A test implementation of the `IDRP` interface that provides asynchronous counter functionality.
 * This is useful for testing DRP systems with async operations.
 */
export class AsyncCounterDRP implements IDRP {
	semanticsType = SemanticsType.pair;

	private _value: number;

	/**
	 * Creates a new AsyncCounterDRP instance
	 * @param [initialValue] - The initial value of the counter (optional, defaults to 0)
	 */
	constructor(initialValue?: number) {
		this._value = initialValue ?? 0;
	}

	/**
	 * Increments the counter asynchronously
	 * @returns The new value of the counter
	 */
	async increment(): Promise<number> {
		await Promise.resolve();
		this._value++;
		return this._value;
	}

	/**
	 * Decrements the counter asynchronously
	 * @returns The new value of the counter
	 */
	async decrement(): Promise<number> {
		await Promise.resolve();
		this._value--;
		return this._value;
	}

	/**
	 * Queries the current value of the counter
	 * @returns The current value of the counter
	 */
	query_value(): number {
		return this._value;
	}

	/**
	 * Resolves conflicts for the counter
	 * @returns The action to take for the conflict
	 */
	resolveConflicts(): ResolveConflictsType {
		return { action: ActionType.Nop };
	}
}
