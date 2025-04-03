import { ActionType, type IDRP, type ResolveConflictsType, SemanticsType, type Vertex } from "@ts-drp/types";

/**
 * AddMulDRP is a register class that implements an add and multiply operation.
 */
export class AddMulDRP implements IDRP {
	semanticsType = SemanticsType.pair;

	private _value: number;

	/**
	 * Constructor for AddMulDRP
	 * @param initialValue - The initial value for the register
	 */
	constructor(initialValue?: number) {
		if (typeof initialValue === "number") {
			this._value = initialValue;
		} else {
			this._value = 0;
		}
	}

	/**
	 * Add a value to the add and multiply operation
	 * @param value - The value to add to the add and multiply operation
	 */
	add(value: number): void {
		if (typeof value !== "number") {
			return;
		}
		this._value += value;
	}

	/**
	 * Multiply a value to the add and multiply operation
	 * @param value - The value to multiply to the add and multiply operation
	 */
	mul(value: number): void {
		if (typeof value !== "number") {
			return;
		}
		this._value *= value;
	}

	/**
	 * Get the value of the add and multiply operation
	 * @returns The value of the add and multiply operation
	 */
	query_value(): number {
		return this._value;
	}

	/**
	 * Resolve conflicts between two vertices
	 * @param vertices - The vertices to resolve conflicts between
	 * @returns The action to take
	 */
	resolveConflicts(vertices: Vertex[]): ResolveConflictsType {
		if (vertices.length < 2 || !vertices[0].hash || !vertices[1].hash || vertices[0].hash === vertices[1].hash) {
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
