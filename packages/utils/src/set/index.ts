/**
 * A set implementation that uses an object to store the set
 * @template T - The type of the set
 */
export class ObjectSet<T extends string | number | symbol> implements Set<T> {
	set: { [key in T]: boolean };
	size: number;

	/**
	 * @param iterable - The iterable to initialize the set with
	 */
	constructor(iterable: Iterable<T> = []) {
		this.set = {} as { [key in T]: boolean };
		this.size = 0;
		for (const item of iterable) {
			this.set[item] = true;
			this.size++;
		}
	}

	/**
	 * Adds an item to the set
	 * @param item - The item to add
	 * @returns The set
	 */
	add(item: T): this {
		if (this.has(item)) return this;

		this.set[item] = true;
		this.size++;
		return this;
	}

	/**
	 * Removes an item from the set
	 * @param item - The item to remove
	 * @returns True if the item was removed, false otherwise
	 */
	delete(item: T): boolean {
		if (!this.has(item)) return false;

		delete this.set[item];
		this.size--;
		return true;
	}

	/**
	 * Checks if the set contains an item
	 * @param item - The item to check
	 * @returns True if the item is in the set, false otherwise
	 */
	has(item: T): boolean {
		return this.set[item] === true;
	}

	/**
	 * Returns an array of the set's entries
	 * @returns An array of the set's entries
	 */
	entries(): SetIterator<[T, T]> {
		const keys = Object.keys(this.set) as T[];
		let index = 0;

		return {
			next: (): IteratorResult<[T, T]> => {
				if (index < keys.length) {
					const key = keys[index++];
					return { value: [key, key], done: false };
				}
				return { value: undefined, done: true };
			},
			[Symbol.iterator]: function (): SetIterator<[T, T]> {
				return this;
			},
		};
	}

	/**
	 * Returns an iterator of the set's values
	 * @returns An iterator of the set's values
	 */
	values(): SetIterator<T> {
		const keys = Object.keys(this.set) as T[];
		let index = 0;

		return {
			next: (): IteratorResult<T> => {
				if (index < keys.length) {
					return { value: keys[index++], done: false };
				} else {
					return { value: undefined, done: true };
				}
			},
			[Symbol.iterator]: function (): SetIterator<T> {
				return this;
			},
		};
	}

	/**
	 * Returns an iterator of the set's keys (same as values for Set)
	 * @returns An iterator of the set's keys
	 */
	keys(): SetIterator<T> {
		return this.values();
	}

	/**
	 * Executes a provided function once for each value in the Set object, in insertion order.
	 * @param callbackfn - Function to execute for each element.
	 * @param thisArg - Value to use as `this` when executing `callbackfn`.
	 */
	forEach(callbackfn: (value: T, value2: T, set: Set<T>) => void, thisArg?: unknown): void {
		const keys = Object.keys(this.set) as T[];
		for (const key of keys) {
			callbackfn.call(thisArg, key, key, this);
		}
	}

	/**
	 * Removes all elements from the set.
	 */
	clear(): void {
		this.set = {} as { [key in T]: boolean };
		this.size = 0;
	}

	/**
	 * @returns The string representation of the Set.
	 */
	toString(): string {
		return `[object ObjectSet]`;
	}

	/**
	 * @returns The string tag of the Set.
	 */
	get [Symbol.toStringTag](): string {
		return "ObjectSet";
	}

	/**
	 * Returns a new Iterator object that contains the values for each element in the Set object in insertion order.
	 * @returns An iterator of the set's values.
	 */
	[Symbol.iterator](): IterableIterator<T> {
		return this.values();
	}
}
