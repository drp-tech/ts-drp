import { ActionType, type IDRP, type ResolveConflictsType, SemanticsType, type Vertex } from "@ts-drp/types";

export enum MapConflictResolution {
	SetWins = 0,
	DeleteWins = 1,
}

/**
 * MapDRP is a class that implements a map of values.
 * @template K - The type of keys in the map
 * @template V - The type of values in the map
 */
export class MapDRP<K, V> implements IDRP {
	semanticsType = SemanticsType.pair;

	private _conflictResolution: MapConflictResolution;
	private _map: Map<K, V>;

	/**
	 * Constructor for MapDRP
	 * @param conflictResolution - The conflict resolution strategy for the map
	 */
	constructor(conflictResolution?: MapConflictResolution) {
		this._map = new Map();
		this._conflictResolution = conflictResolution ?? MapConflictResolution.SetWins;
	}

	/**
	 * Set a value in the map
	 * @param key - The key to set the value for
	 * @param value - The value to set in the map
	 */
	set(key: K, value: V): void {
		this._map.set(key, value);
	}

	/**
	 * Delete a value from the map
	 * @param key - The key to delete the value for
	 */
	delete(key: K): void {
		this._map.delete(key);
	}

	/**
	 * Check if the map contains a key
	 * @param key - The key to check for in the map
	 * @returns True if the key is in the map, false otherwise
	 */
	query_has(key: K): boolean {
		return this._map.has(key);
	}

	/**
	 * Get a value from the map
	 * @param key - The key to get the value for
	 * @returns The value associated with the key, or undefined if the key is not in the map
	 */
	query_get(key: K): V | undefined {
		return this._map.get(key);
	}

	/**
	 * Get all entries in the map
	 * @returns An array of all entries in the map
	 */
	query_entries(): [K, V][] {
		return Array.from(this._map.entries());
	}

	/**
	 * Get all keys in the map
	 * @returns An array of all keys in the map
	 */
	query_keys(): K[] {
		return Array.from(this._map.keys());
	}

	/**
	 * Get all values in the map
	 * @returns An array of all values in the map
	 */
	query_values(): V[] {
		return Array.from(this._map.values());
	}

	/**
	 * Compute a hash for a given string
	 * @param data - The string to compute the hash for
	 * @returns The hash of the string
	 */
	private _computeHash(data: string): string {
		let hash = 0;
		for (let i = 0; i < data.length; i++) {
			const char = data.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash |= 0;
		}
		return hash.toString(16);
	}

	/**
	 * Resolve conflicts between two vertices
	 * @param vertices - The vertices to resolve conflicts between
	 * @returns The action to take
	 */
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
