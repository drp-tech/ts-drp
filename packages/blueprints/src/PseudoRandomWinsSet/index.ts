import { Smush32 } from "@thi.ng/random";
import {
	ActionType,
	type DRP,
	type Hash,
	type Operation,
	type ResolveConflictsType,
	SemanticsType,
	type Vertex,
} from "@ts-drp/object";

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
export class PseudoRandomWinsSet<T> implements DRP {
	operations: string[] = ["add", "remove"];
	state: Map<T, boolean>;
	semanticsType = SemanticsType.multiple;
	// biome-ignore lint: attributes can be anything
	[key: string]: any;

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
		vertices.sort((a, b) => (a.hash < b.hash ? -1 : 1));
		const seed: string = vertices.map((vertex) => vertex.hash).join("");
		const rnd = new Smush32(computeHash(seed));
		const chosen = rnd.int() % vertices.length;
		const hashes: Hash[] = vertices.map((vertex) => vertex.hash);
		hashes.splice(chosen, 1);
		return { action: ActionType.Drop, vertices: hashes };
	}

	// biome-ignore lint: attributes can be anything
	updateAttribute(key: string, value: any): void {
		if (!(key in this)) {
			throw new Error(`Key '${String(key)}' does not exist in this object.`);
		}
		if (typeof this[key] === "function") {
			throw new Error(`Cannot update method '${key}' using updateState.`);
		}
		this[key] = value;
	}
}
