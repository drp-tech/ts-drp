/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, describe, it } from "vitest";

import { deserializeValue, serializeValue } from "../src/index.js";

class TestCustomClass {
	constructor(
		public name: string,
		public value: number
	) {}
}

describe("Serialize & deserialize", () => {
	it("should serialize & deserialize correctly simple object", () => {
		const obj = { a: 1, b: 2 };
		const serialized = serializeValue(obj);
		const deserialized = deserializeValue(serialized);
		expect(deserialized).toEqual(obj);
	});

	it("should serialize & deserialize correctly simple Map", () => {
		const map = new Map([
			["a", 1],
			["b", 2],
		]);
		const serialized = serializeValue(map);
		const deserialized = deserializeValue(serialized);
		expect(deserialized).toEqual(map);
	});

	it("should serialize & deserialize correctly simple Set", () => {
		const set = new Set([1, 2]);
		const serialized = serializeValue(set);
		const deserialized = deserializeValue(serialized);
		expect(deserialized).toEqual(set);
	});

	it("should serialize & deserialize correctly simple Date", () => {
		const date = new Date();
		const serialized = serializeValue(date);
		const deserialized = deserializeValue(serialized);
		expect(deserialized).toEqual(date);
	});

	it("should serialize & deserialize correctly complex map", () => {
		const map = new Map<string, any>();
		map.set("a", new Set([1, 2]));
		map.set("b", new Set([3, 4]));
		map.set("c", { a: 1, b: 2 });
		map.set("d", new Date());
		map.set("e", [1, 2, 3]);
		const serialized = serializeValue(map);
		const deserialized = deserializeValue(serialized);
		expect(deserialized).toEqual(map);
	});

	it("should serialize & deserialize correctly complex set", () => {
		const set = new Set<any>();
		set.add(new Set([1, 2]));
		set.add(new Set([3, 4]));
		set.add({ a: 1, b: 2 });
		set.add(new Date());
		set.add([1, 2, 3]);
		const serialized = serializeValue(set);
		const deserialized = deserializeValue(serialized);
		expect(deserialized).toEqual(set);
	});

	it("should serialize & deserialize correctly Array", () => {
		const array = [1, 2, 3];
		const serialized = serializeValue(array);
		const deserialized = deserializeValue(serialized);
		expect(deserialized).toEqual(array);
	});

	it("should serialize & deserialize correctly complex array", () => {
		const array = [
			new Set([1, 2]),
			new Set([3, 4]),
			{ a: 1, b: 2 },
			new Date(),
			[1, 2, 3],
			[new Set([1, 2])],
			new Map<string, any>([
				["a", 1],
				["b", 2],
				["c", new Set([1, 2])],
				["d", new Date()],
			]),
			new Set([1, 2]),
			new Date(),
			new TestCustomClass("test", 42),
			[new TestCustomClass("test", 42)],
		];
		const serialized = serializeValue(array);
		const deserialized = deserializeValue(serialized);
		expect(deserialized).toEqual(array);
	});

	it("should serialize & deserialize correctly Uint8Array", () => {
		const uint8Array = new Uint8Array([1, 2, 3, 4]);
		const serialized = serializeValue(uint8Array);
		const deserialized = deserializeValue(serialized);
		expect(deserialized).toEqual(uint8Array);
	});

	it("should serialize & deserialize correctly Float32Array", () => {
		const float32Array = new Float32Array([1.1, 2.2, 3.3, 4.4]);
		const serialized = serializeValue(float32Array);
		const deserialized = deserializeValue(serialized);
		expect(deserialized).toEqual(float32Array);
	});

	it("should serialize & deserialize correctly CustomClass", () => {
		const customObj = new TestCustomClass("test", 42);
		const serialized = serializeValue(customObj);
		const deserialized = deserializeValue(serialized);
		expect(deserialized).toEqual(customObj);
	});

	it("should serialize & deserialize correctly complex nested object", () => {
		const obj = {
			a: new Set([1, 2]),
			b: new Set([3, 4]),
			c: { a: 1, b: 2 },
			d: new Date(),
			e: [1, 2, 3],
			f: new Map<string, any>([
				["a", 1],
				["b", 2],
				["c", new Set([1, 2])],
				["d", new Date()],
				["e", [1, 2, 3]],
				["f", new Uint8Array([1, 2, 3, 4])],
				["g", new Float32Array([1.1, 2.2, 3.3, 4.4])],
				["h", new TestCustomClass("test", 42)],
			]),
			g: new Uint8Array([1, 2, 3, 4]),
			h: new Float32Array([1.1, 2.2, 3.3, 4.4]),
			i: new TestCustomClass("nested", 123),
			j: [new Set([1, 2, 3])],
			k: [new TestCustomClass("nested", 123)],
			l: [
				new Map<string, any>([
					["a", 1],
					["b", 2],
					["c", new Set([1, 2])],
					["d", new Date()],
					["e", [1, 2, 3]],
					["f", new Uint8Array([1, 2, 3, 4])],
					["g", new Float32Array([1.1, 2.2, 3.3, 4.4])],
					["h", new TestCustomClass("test", 42)],
				]),
			],
		};
		const serialized = serializeValue(obj);
		const deserialized = deserializeValue(serialized);
		expect(deserialized).toEqual(obj);
	});
});
