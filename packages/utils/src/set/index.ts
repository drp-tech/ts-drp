/**
 * A set implementation that uses an object to store the set
 * @template T - The type of the set
 */
export class ObjectSet<T extends string | number | symbol> {
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
	 */
	add(item: T): void {
		if (this.has(item)) return;

		this.set[item] = true;
		this.size++;
	}

	/**
	 * Removes an item from the set
	 * @param item - The item to remove
	 */
	delete(item: T): void {
		if (!this.has(item)) return;

		delete this.set[item];
		this.size--;
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
	entries(): Array<T> {
		return Object.keys(this.set) as Array<T>;
	}
}
