import { AddMulDRP } from "@ts-drp/blueprints/src/AddMul/index.js";
import { RecursiveMulDRP } from "@ts-drp/blueprints/src/RecursiveMul/index.js";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { DRPObject, ObjectACL } from "../src/index.js";

const acl = new ObjectACL({
	admins: new Map(),
	permissionless: true,
});

let drp: DRPObject;
let drp2: DRPObject;

beforeAll(async () => {
	const { Console } = await import("node:console");
	globalThis.console = new Console(process.stdout, process.stderr);
});

describe("Test: ActionTypes (Nop and Swap)", () => {
	// AddMul always adds first, then multiplies
	let addMul: AddMulDRP;
	let addMul2: AddMulDRP;

	beforeEach(() => {
		drp = new DRPObject({ peerId: "peer1", drp: new AddMulDRP(), acl });
		drp2 = new DRPObject({ peerId: "peer2", drp: new AddMulDRP(), acl });
		addMul = drp.drp as AddMulDRP;
		addMul2 = drp2.drp as AddMulDRP;

		vi.useFakeTimers();
		vi.setSystemTime(new Date(Date.UTC(1998, 11, 19)));
	});

	test("Test: Nop", () => {
		addMul.add(1);
		addMul2.add(2);
		drp.merge(drp2.vertices);
		drp2.merge(drp.vertices);
		expect(addMul.query_value()).toBe(3);
		expect(addMul2.query_value()).toBe(3);

		addMul.add(3);
		addMul2.mul(2);
		drp.merge(drp2.vertices);
		drp2.merge(drp.vertices);
		expect(addMul.query_value()).toBe(12);
		expect(addMul2.query_value()).toBe(12);
	});

	test("Test: Swap", () => {
		// set initial shared value to 5
		addMul.add(5);
		drp.merge(drp2.vertices);
		drp2.merge(drp.vertices);

		addMul.mul(5);
		addMul2.add(5);
		drp.merge(drp2.vertices);
		drp2.merge(drp.vertices);
		expect(addMul.query_value()).toBe(50);
		expect(addMul2.query_value()).toBe(50);

		addMul2.mul(2);
		addMul.add(2);
		drp.merge(drp2.vertices);
		drp2.merge(drp.vertices);
		expect(addMul.query_value()).toBe(104);
		expect(addMul2.query_value()).toBe(104);
	});

	test("Test: Multiple Operations", () => {
		// set initial shared value to 5
		addMul.add(5);
		drp.merge(drp2.vertices);
		drp2.merge(drp.vertices);

		addMul.add(5);
		addMul.add(6);
		addMul2.mul(3);
		drp.merge(drp2.vertices);
		drp2.merge(drp.vertices);

		expect(addMul.query_value()).toBe(48);
		expect(addMul2.query_value()).toBe(48);
	});

	test("Test: Multiple Operations 2", () => {
		// set initial shared value to 5
		addMul.add(5);
		drp.merge(drp2.vertices);
		drp2.merge(drp.vertices);
		addMul.mul(5);
		addMul.add(5);
		addMul2.add(5);
		drp.merge(drp2.vertices);
		drp2.merge(drp.vertices);
		expect(addMul.query_value()).toBe(75);
		expect(addMul2.query_value()).toBe(75);

		addMul2.mul(2);
		vi.setSystemTime(new Date(Date.UTC(1998, 11, 24)));
		addMul2.add(2);
		vi.setSystemTime(new Date(Date.UTC(1998, 11, 25)));
		addMul.add(3);
		vi.setSystemTime(new Date(Date.UTC(1998, 11, 26)));
		addMul.mul(3);
		drp.merge(drp2.vertices);
		drp2.merge(drp.vertices);
		expect(addMul.query_value()).toBe(480);
		expect(addMul2.query_value()).toBe(480);
	});
});

describe("Test: ActionTypes (Drops)", () => {
	test("Test: DropLeft", () => {});

	test("Test: DropRight", () => {});

	test("Test: Drop", () => {});
});

describe("Test: ActionTypes (RecMul)", () => {
	let drp: DRPObject;
	let drp2: DRPObject;
	let recMul: RecursiveMulDRP;
	let recMul2: RecursiveMulDRP;

	beforeEach(() => {
		drp = new DRPObject({ peerId: "peer1", drp: new RecursiveMulDRP(), acl });
		drp2 = new DRPObject({ peerId: "peer2", drp: new RecursiveMulDRP(), acl });
		recMul = drp.drp as RecursiveMulDRP;
		recMul2 = drp2.drp as RecursiveMulDRP;

		vi.useFakeTimers();
		vi.setSystemTime(new Date(Date.UTC(1998, 11, 19)));
	});

	test("Test: Basic Operations", () => {
		recMul.recursive_mul(3);
		recMul2.recursive_mul(2);
		console.log(recMul.query_value());
		drp.merge(drp2.vertices);
		drp2.merge(drp.vertices);
		expect(recMul.query_value()).toBe(6); // 1*3*2
		expect(recMul2.query_value()).toBe(6);

		recMul.recursive_mul(2);
		recMul2.recursive_mul(1);
		drp.merge(drp2.vertices);
		drp2.merge(drp.vertices);
		expect(recMul.query_value()).toBe(12); // 6 * 2 * 1
		expect(recMul2.query_value()).toBe(12);
	});

	test("Test: Multiple Operations", () => {
		recMul.recursive_mul(3);
		recMul.recursive_mul(3);
		recMul2.recursive_mul(3);
		drp.merge(drp2.vertices);
		drp2.merge(drp.vertices);
		expect(recMul.query_value()).toBe(27); // 1*3*3*3
		expect(recMul2.query_value()).toBe(27);

		recMul.recursive_mul(2);
		recMul.recursive_mul(1);
		recMul2.recursive_mul(2);
		drp.merge(drp2.vertices);
		drp2.merge(drp.vertices);
		expect(recMul.query_value()).toBe(108); // 27 * 2 * 1 * 2
		expect(recMul2.query_value()).toBe(108);
	});
});
