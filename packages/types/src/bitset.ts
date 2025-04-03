export interface IBitSet {
	/**
	 * Returns the bytes of the bit set.
	 * @returns The bytes of the bit set.
	 */
	toBytes(): Uint8Array;
	/**
	 * Clears the bit set.
	 */
	clear(): void;
	/**
	 * Sets the bit at the given index.
	 * @param index - The index of the bit to set.
	 * @param value - The value to set the bit to.
	 */
	set(index: number, value: boolean): void;
	/**
	 * Returns the bit at the given index.
	 * @param index - The index of the bit to get.
	 * @returns The value of the bit at the given index (true/1 or false/0).
	 */
	get(index: number): boolean;
	/**
	 * Flips the bit at the given index.
	 * @param index - The index of the bit to flip
	 */
	flip(index: number): void;
	/**
	 * Returns the bit set that is the intersection of the two bit sets.
	 * @param other - The other bit set.
	 * @returns The intersection of the two bit sets.
	 */
	and(other: IBitSet): IBitSet;
	/**
	 * Returns the bit set that is the union of the two bit sets.
	 * @param other - The other bit set.
	 * @returns The union of the two bit sets.
	 */
	or(other: IBitSet): IBitSet;
	/**
	 * Returns the bit set that is the symmetric difference of the two bit sets.
	 * @param other - The other bit set.
	 * @returns The symmetric difference of the two bit sets.
	 */
	xor(other: IBitSet): IBitSet;
	/**
	 * Returns the bit set that is the negation of the bit set.
	 * @returns The negation of the bit set.
	 */
	not(): IBitSet;
	/**
	 * Returns the bit set as a string of 0s and 1s.
	 * @returns The bit set as a string of 0s and 1s.
	 */
	toString(): string;
}
