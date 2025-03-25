import { DRPState, DRPStateEntry, type Hash, type IDRP } from "@ts-drp/types";
import { cloneDeep } from "es-toolkit";

import { HashGraph } from "./hashgraph/index.js";

export class StateNotFoundError extends Error {
	constructor(message: string = "DRPState not found") {
		super(message);
		this.name = "DRPStateNotFoundError";
	}
}

/**
 * This class is used to manage the state of a DRPObject.
 *
 * It contains all the states attached to the corresponding LCA
 * With the state this allow use to construct back the object in the same state it was with the given LCA
 */
export class DRPObjectStateManager<T extends IDRP> {
	private states: Map<Hash, DRPState>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private emptyConstructor: { prototype: any };

	constructor(drp: T) {
		this.states = new Map();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.emptyConstructor = drp.constructor as { prototype: any };

		this.states = new Map([[HashGraph.rootHash, stateFromDRP(drp)]]);
	}

	get(hash: Hash): DRPState | undefined {
		return this.states.get(hash);
	}

	drpFromHash(hash: Hash): T {
		const state = this.states.get(hash);
		if (!state) {
			throw new StateNotFoundError(`State ${hash} not found`);
		}

		const instance = this.createEmptyInstance();
		this.applyState(instance, state);
		return instance;
	}

	setState(hash: Hash, drp: T): DRPState {
		const state = stateFromDRP(drp);
		this.states.set(hash, state);
		return state;
	}

	private createEmptyInstance(): T {
		return Object.create(this.emptyConstructor.prototype);
	}

	private applyState(instance: T, state: DRPState): void {
		for (const entry of state.state) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- right fully so this is not a problem
			(instance as any)[entry.key] = cloneDeep(entry.value);
		}
	}
}

function stateFromDRP(drp: IDRP): DRPState {
	const state = DRPState.create();
	for (const key of Object.keys(drp)) {
		if (typeof drp[key] === "function") continue;

		state.state.push(DRPStateEntry.create({ key, value: cloneDeep(drp[key]) }));
	}
	return state;
}
