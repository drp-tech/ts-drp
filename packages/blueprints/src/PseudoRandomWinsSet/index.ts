import { Smush32 } from "@thi.ng/random";
import {
	ActionType,
	type CRO,
	type Hash,
	type Operation,
	type ResolveConflictsType,
	SemanticsType,
	type Vertex,
} from "@topology-foundation/object";

const MOD = 1e9 + 9;

function computeHash(s: string): number {
	let hash = 0;
	for (let i = 0; i < s.length; i++) {
		// Same as hash = hash * 31 + s.charCodeAt(i);
		hash = (hash << 5) - hash + s.charCodeAt(i);
		hash %= MOD;
	}
	return hash;
}

/* 	
	Example implementation of multi-vertex semantics that uses the reduce action type.
	An arbitrary number of concurrent operations can be reduced to a single operation.
	The winning operation is chosen using a pseudo-random number generator.
*/
export class PseudoRandomWinsSet<T> implements CRO {
	operations: string[] = ["add", "remove"];
	state: Map<T, boolean>;
	semanticsType = SemanticsType.multiple;

	constructor() {
		this.state = new Map<T, boolean>();
	}

	private _add(value: T): void {
		if (!this.state.get(value)) this.state.set(value, true);
	}

	add(value: T): void {
		this._add(value);
	}

	private _remove(value: T): void {
		if (this.state.get(value)) this.state.set(value, false);
	}

	remove(value: T): void {
		this._remove(value);
	}

	contains(value: T): boolean {
		return this.state.get(value) === true;
	}

	values(): T[] {
		return Array.from(this.state.entries())
			.filter(([_, exists]) => exists)
			.map(([value, _]) => value);
	}

	resolveConflicts(vertices: Vertex[]): ResolveConflictsType {
		if (vertices.length <= 1) {
			return { action: ActionType.Nop };
		}

		// Select a random vertex
		const randomIndex = Math.floor(Math.random() * vertices.length);
		const selectedVertex = vertices[randomIndex];

		// Return the action to keep only the selected vertex
		return {
			action: ActionType.Drop,
			vertices: vertices.filter(v => v.hash !== selectedVertex.hash).map(v => v.hash)
		};
	}

	// merged at HG level and called as a callback
	mergeCallback(operations: Operation[]): void {
		this.state = new Map<T, boolean>();
		for (const op of operations) {
			switch (op.type) {
				case "add":
					if (op.value !== null) this._add(op.value);
					break;
				case "remove":
					if (op.value !== null) this._remove(op.value);
					break;
				default:
					break;
			}
		}
	}
}
