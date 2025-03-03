import { ActionType, type DRP, type ResolveConflictsType, SemanticsType } from "@ts-drp/object";
import { Vertex } from "@ts-drp/types";

export interface RecursiveMulOptions {
	initialValue?: number;
	withHistory?: boolean;
}

export class RecursiveMulDRP implements DRP {
	semanticsType = SemanticsType.pair;

	private readonly _withHistory: boolean;
	private _value: number;
	private _history: number[];

	constructor({ initialValue, withHistory }: RecursiveMulOptions = {}) {
		if (typeof initialValue === "number") {
			this._value = initialValue;
		} else {
			this._value = 1;
		}
		this._history = [];
		this._withHistory = withHistory ?? false;
	}

	recursive_mul(value: number): void {
		if (typeof value !== "number") {
			return;
		}
		if (value === 0) {
			return;
		}
		this._value = this._multiply(value, this._value);
	}

	private _multiply(value: number, base: number): number {
		if (this._withHistory) {
			this._history.push(base);
			if (this._history.length > 1000) {
				this._history.shift();
			}
		}
		if (value === 1) return base; // Base case
		return base + this._multiply(value - 1, base);
	}

	query_value(): number {
		return this._value;
	}

	query_history(): number[] {
		return this._history;
	}

	resolveConflicts(_: Vertex[]): ResolveConflictsType {
		return { action: ActionType.Nop };
	}
}
