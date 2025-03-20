import { ActionType, type IDRP, type ResolveConflictsType, SemanticsType } from "@ts-drp/types";

export class AsyncCounterDRP implements IDRP {
	semanticsType = SemanticsType.pair;

	private _value: number;

	constructor(initialValue?: number) {
		this._value = initialValue ?? 0;
	}

	async increment(): Promise<number> {
		await Promise.resolve();
		this._value++;
		return this._value;
	}

	async decrement(): Promise<number> {
		await Promise.resolve();
		this._value--;
		return this._value;
	}

	query_value(): number {
		return this._value;
	}

	resolveConflicts(): ResolveConflictsType {
		return { action: ActionType.Nop };
	}
}
