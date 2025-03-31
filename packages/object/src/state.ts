import { DRPState, DRPStateEntry, type Hash, type IACL, type IDRP } from "@ts-drp/types";
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
	private drpStates: Map<Hash, DRPState>;
	private aclStates: Map<Hash, DRPState>;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private drpConstructor?: { prototype: any };
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private aclConstructor: { prototype: any };

	constructor(acl: IACL, drp?: T) {
		this.drpStates = new Map();
		this.aclStates = new Map();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.drpConstructor = drp?.constructor as { prototype: any };
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.aclConstructor = acl.constructor as { prototype: any };

		this.drpStates.set(HashGraph.rootHash, drp ? stateFromDRP(drp) : DRPState.create());
		this.aclStates.set(HashGraph.rootHash, stateFromDRP(acl));
	}

	getDRP(hash: Hash): DRPState | undefined {
		return this.drpStates.get(hash);
	}

	setDRP(hash: Hash, state: DRPState): void {
		this.drpStates.set(hash, state);
	}

	getACL(hash: Hash): DRPState | undefined {
		return this.aclStates.get(hash);
	}

	setACL(hash: Hash, state: DRPState): void {
		this.aclStates.set(hash, state);
	}

	fromHash(hash: Hash): [T | undefined, IACL] {
		if (!this.aclConstructor) {
			throw new Error("ACL constructor not set");
		}

		const drpState = this.drpStates.get(hash);
		const aclState = this.aclStates.get(hash);
		if (!drpState || !aclState) {
			throw new StateNotFoundError(`State ${hash} not found`);
		}

		const acl = Object.create(this.aclConstructor.prototype);
		this.applyState(acl, aclState);

		if (this.drpConstructor) {
			const drp = Object.create(this.drpConstructor.prototype);
			this.applyState(drp, drpState);
			return [drp, acl];
		}

		return [undefined, acl];
	}

	fromHashACL(hash: Hash): IACL {
		const state = this.aclStates.get(hash);
		if (!state) {
			throw new StateNotFoundError(`State ${hash} not found`);
		}
		return Object.create(this.aclConstructor.prototype);
	}

	private applyState(instance: T | IACL, state: DRPState): void {
		for (const entry of state.state) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- right fully so this is not a problem
			(instance as any)[entry.key] = cloneDeep(entry.value);
		}
	}
}

export function stateFromDRP(drp: IDRP | undefined): DRPState {
	const state = DRPState.create();
	if (!drp) return state;
	for (const key of Object.keys(drp)) {
		if (typeof drp[key] === "function") continue;

		state.state.push(DRPStateEntry.create({ key, value: cloneDeep(drp[key]) }));
	}
	return state;
}
