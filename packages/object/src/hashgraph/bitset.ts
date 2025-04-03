/**
 * BitSet is associated with each vertex and is used to store the indices of the vertices that are reachable.
 * In other words, all the vertices causally before in the hashgraph.
 * When processing in the topologically ordered manner, we set the BitSet of the vertex to the bitwise OR of the BitSet of its dependencies.
 * Then, to check if two vertices are causally related, we check if the BitSet of the first vertex contains the index of the second vertex and vice-versa.
 * Algorithm for more optimal causality check inspired by https://stackoverflow.com/a/78133041
 */
export class BitSet {
	private data: Uint32Array;

	/**
	 * Constructor for the BitSet class.
	 * @param bits - The number of bits in the BitSet.
	 * @param data - The data to initialize the BitSet with.
	 */
	constructor(bits: number, data?: Uint8Array) {
		const size = Math.ceil(bits / 32);
		if (data === undefined) {
			this.data = new Uint32Array(size);
		} else {
			this.data = new Uint32Array(data.slice().buffer, 0, size);
		}
	}

	/**
	 * Converts the BitSet to a Uint8Array.
	 * @returns The Uint8Array representation of the BitSet.
	 */
	toBytes(): Uint8Array {
		const data = new Uint8Array(this.data.buffer, this.data.byteOffset, this.data.byteLength);
		return data.slice();
	}

	/**
	 * Clears the BitSet.
	 */
	clear(): void {
		this.data = new Uint32Array(this.data.length);
	}

	/**
	 * Sets the value of the BitSet at the given index.
	 * @param index - The index to set the value at.
	 * @param value - The value to set the BitSet at the given index to.
	 */
	set(index: number, value: boolean): void {
		// (index / 32) | 0 is equivalent to Math.floor(index / 32)
		const byteIndex = (index / 32) | 0;
		const bitIndex = index % 32;
		// if value is false, and with all 1s except the bit at bitIndex
		if (value) this.data[byteIndex] |= 1 << bitIndex;
		else this.data[byteIndex] &= ~(1 << bitIndex);
	}

	/**
	 * Gets the value of the BitSet at the given index.
	 * @param index - The index to get the value at.
	 * @returns The value of the BitSet at the given index.
	 */
	get(index: number): boolean {
		// (index / 32) | 0 is equivalent to Math.floor(index / 32)
		const byteIndex = (index / 32) | 0;
		const bitIndex = index % 32;
		return (this.data[byteIndex] & (1 << bitIndex)) !== 0;
	}

	/**
	 * Flips the value of the BitSet at the given index.
	 * @param index - The index to flip the value at.
	 */
	flip(index: number): void {
		// (index / 32) | 0 is equivalent to Math.floor(index / 32)
		const byteIndex = (index / 32) | 0;
		const bitIndex = index % 32;
		this.data[byteIndex] ^= 1 << bitIndex;
	}

	// AND two bitsets of the same size
	/**
	 * AND two bitsets of the same size.
	 * @param other - The other BitSet to AND with.
	 * @returns The result of the AND operation.
	 */
	and(other: BitSet): BitSet {
		const result = new BitSet(this.data.length * 32);
		for (let i = 0; i < this.data.length; i++) {
			result.data[i] = this.data[i] & other.data[i];
		}
		return result;
	}

	// OR two bitsets of the same size
	/**
	 * OR two bitsets of the same size.
	 * @param other - The other BitSet to OR with.
	 * @returns The result of the OR operation.
	 */
	or(other: BitSet): BitSet {
		const result = new BitSet(this.data.length * 32);
		for (let i = 0; i < this.data.length; i++) {
			result.data[i] = this.data[i] | other.data[i];
		}
		return result;
	}

	// XOR two bitsets of the same size
	/**
	 * XOR two bitsets of the same size.
	 * @param other - The other BitSet to XOR with.
	 * @returns The result of the XOR operation.
	 */
	xor(other: BitSet): BitSet {
		const result = new BitSet(this.data.length * 32);
		for (let i = 0; i < this.data.length; i++) {
			result.data[i] = this.data[i] ^ other.data[i];
		}
		return result;
	}

	/**
	 * NOT the BitSet.
	 * @returns The result of the NOT operation.
	 */
	not(): BitSet {
		const result = new BitSet(this.data.length * 32);
		for (let i = 0; i < this.data.length; i++) {
			result.data[i] = ~this.data[i];
		}
		return result;
	}

	/**
	 * Converts the BitSet to a string.
	 * @returns The string representation of the BitSet.
	 */
	toString(): string {
		return Array.from(this.data)
			.reverse()
			.map((int) => int.toString(2).padStart(32, "0"))
			.join("");
	}
}
