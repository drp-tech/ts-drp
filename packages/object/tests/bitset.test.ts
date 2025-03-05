import { beforeEach, describe, expect, test } from "vitest";

import { BitSet } from "../src/hashgraph/bitset.js";

describe("BitSet Test", () => {
	let bitset: BitSet;

	beforeEach(() => {
		// Bitset of size 65
		bitset = new BitSet(65);
	});

	test("Test: Bitset data", () => {
		for (let i = 0; i < 65; i++) {
			bitset.set(i, true);
		}
		for (let i = 0; i < 65; i++) {
			expect(bitset.get(i)).toBe(true);
		}
		for (let i = 0; i < 65; i++) {
			bitset.set(i, false);
		}
		for (let i = 0; i < 65; i++) {
			expect(bitset.get(i)).toBe(false);
		}
	});

	test("Test: BitSet", () => {
		bitset.set(0, true);
		bitset.set(50, true);

		expect(bitset.get(0)).toBe(true);
		expect(bitset.get(49)).toBe(false);
		expect(bitset.get(50)).toBe(true);

		bitset.flip(49);
		bitset.flip(50);
		expect(bitset.get(49)).toBe(true);
		expect(bitset.get(50)).toBe(false);

		bitset.clear();

		let other: BitSet = new BitSet(65);
		other.set(0, true);
		other = other.or(bitset);
		expect(other.get(0)).toBe(true);

		other.set(0, false);
		expect(other.get(0)).toBe(false);

		other = other.and(bitset);
		expect(other.get(0)).toBe(false);
	});

	test("check toBytes", () => {
		const toBytes = bitset.toBytes();
		const expected = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
		expect(toBytes).toBeInstanceOf(Uint8Array);
		expect(toBytes).toEqual(expected);
	});

	test("Bitset xor bit", () => {
		const data = new Uint32Array([0, 0, 0]) as unknown as Uint8Array;
		data[0] = 1;
		const otherBitset = new BitSet(65, data);
		const result = bitset.xor(otherBitset);
		const expected = new Uint32Array([1, 0, 0]) as unknown as Uint8Array;
		const bitsetExpected = new BitSet(65, expected);
		expect(result).toEqual(bitsetExpected);
	});

	test("Bitset not", () => {
		const notBitset = bitset.not();
		const expectBitset = new BitSet(
			65,
			new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff]) as unknown as Uint8Array
		);
		expect(notBitset).toEqual(expectBitset);
	});

	test("Bitset toString", () => {
		const toStringBitset = bitset.toString();
		const expectString = "0".repeat(96);
		expect(toStringBitset).toEqual(expectString);
	});
});

describe("BitSet Test Data not undefined", () => {
	let bitset: BitSet;

	beforeEach(() => {
		const data = new Uint32Array(3) as unknown as Uint8Array;
		bitset = new BitSet(65, data);
	});

	test("Test: Bitset data not undefined", () => {
		expect(bitset).not.toBe(undefined);
	});
});
