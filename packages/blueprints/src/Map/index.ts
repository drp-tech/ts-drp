import { ActionType, type IDRP, type ResolveConflictsType, SemanticsType, type Vertex } from "@ts-drp/types";

export enum MapConflictResolution {
	SetWins = 0,
	DeleteWins = 1,
}

export class MapDRP<K, V> implements IDRP {
	semanticsType = SemanticsType.pair;

	private _conflictResolution: MapConflictResolution;
	private _map: Map<K, V>;

	constructor(conflictResolution?: MapConflictResolution) {
		this._map = new Map();
		this._conflictResolution = conflictResolution ?? MapConflictResolution.SetWins;
	}

	set(key: K, value: V): void {
		this._map.set(key, value);
	}

	delete(key: K): void {
		this._map.delete(key);
	}

	query_has(key: K): boolean {
		return this._map.has(key);
	}

	query_get(key: K): V | undefined {
		return this._map.get(key);
	}

	query_entries(): [K, V][] {
		return Array.from(this._map.entries());
	}

	query_keys(): K[] {
		return Array.from(this._map.keys());
	}

	query_values(): V[] {
		return Array.from(this._map.values());
	}

	// simple hash function
	private _computeHash(data: string): string {
		let hash = 0;
		for (let i = 0; i < data.length; i++) {
			const char = data.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash |= 0;
		}
		return hash.toString(16);
	}

	resolveConflicts(vertices: Vertex[]): ResolveConflictsType {
		if (!vertices[0].operation || !vertices[1].operation) {
			return { action: ActionType.Nop };
		}

		const values0 = vertices[0].operation.value;
		const values1 = vertices[1].operation.value;

		// if keys are different, return no-op
		if (values0[0] !== values1[0]) {
			return { action: ActionType.Nop };
		}

		// if both are delete operations, return no-op
		if (vertices[0].operation.opType === "delete" && vertices[1].operation.opType === "delete") {
			return { action: ActionType.Nop };
		}

		// if both are set operations, keep operation with higher hash value
		if (vertices[0].operation.opType === "set" && vertices[1].operation.opType === "set") {
			const hash0 = this._computeHash(JSON.stringify(values0[1]));
			const hash1 = this._computeHash(JSON.stringify(values1[1]));
			if (hash0 > hash1) {
				return { action: ActionType.DropRight };
			}
			if (hash0 < hash1) {
				return { action: ActionType.DropLeft };
			}
			// return no-op if two value are equal
			return { action: ActionType.Nop };
		}

		return this._conflictResolution === MapConflictResolution.SetWins
			? {
					action: vertices[0].operation.opType === "set" ? ActionType.DropRight : ActionType.DropLeft,
				}
			: {
					action: vertices[0].operation.opType === "set" ? ActionType.DropLeft : ActionType.DropRight,
				};
	}
}
