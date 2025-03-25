export class ObjectSet<T extends string | number | symbol> {
	set: { [key in T]: boolean };
	size: number;

	constructor(iterable: Iterable<T> = []) {
		this.set = {} as { [key in T]: boolean };
		this.size = 0;
		for (const item of iterable) {
			this.set[item] = true;
			this.size++;
		}
	}

	add(item: T): void {
		if (this.has(item)) return;

		this.set[item] = true;
		this.size++;
	}

	delete(item: T): void {
		if (!this.has(item)) return;

		delete this.set[item];
		this.size--;
	}

	has(item: T): boolean {
		return this.set[item] === true;
	}

	entries(): Array<T> {
		return Object.keys(this.set) as Array<T>;
	}
}
