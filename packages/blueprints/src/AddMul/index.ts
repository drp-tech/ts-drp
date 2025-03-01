import { type DRP, type ResolveConflictsType } from "@ts-drp/object";
import { ActionType, SemanticsType, type Vertex } from "@ts-drp/types";

export class AddMulDRP implements DRP {
	semanticsType = SemanticsType.pair;

	private _value: number;

	constructor(initialValue?: number) {
		if (typeof initialValue === "number") {
			this._value = initialValue;
		} else {
			this._value = 0;
		}
	}

	add(value: number): void {
		if (typeof value !== "number") {
			return;
		}
		this._value += value;
	}

	mul(value: number): void {
		if (typeof value !== "number") {
			return;
		}
		this._value *= value;
	}

	query_value(): number {
		return this._value;
	}

	resolveConflicts(vertices: Vertex[]): ResolveConflictsType {
		if (
			vertices.length < 2 ||
			vertices[0].hash === undefined ||
			vertices[1].hash === undefined ||
			vertices[0].hash === vertices[1].hash
		) {
			return { action: ActionType.Nop };
		}

		const [left, right] = vertices;
		const leftOp = left.operation?.opType ?? "";
		const rightOp = right.operation?.opType ?? "";

		if (leftOp === "mul" && rightOp === "add") {
			return { action: ActionType.Swap };
		}

		return { action: ActionType.Nop };
	}
}
