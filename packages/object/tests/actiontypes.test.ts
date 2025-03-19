import { AddMulDRP } from "@ts-drp/blueprints";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { DRPObject, ObjectACL } from "../src/index.js";

const acl = new ObjectACL({
	admins: [],
	permissionless: true,
});

beforeAll(async () => {
	const { Console } = await import("node:console");
	globalThis.console = new Console(process.stdout, process.stderr);
});

describe("Test: ActionTypes (Nop and Swap)", () => {
	let drp: DRPObject<AddMulDRP>;
	let drp2: DRPObject<AddMulDRP>;

	beforeEach(() => {
		drp = new DRPObject({ peerId: "peer1", drp: new AddMulDRP(), acl });
		drp2 = new DRPObject({ peerId: "peer2", drp: new AddMulDRP(), acl });

		vi.useFakeTimers();
		vi.setSystemTime(new Date(Date.UTC(1998, 11, 19)));
	});

	test("Test: Nop", async () => {
		drp.drp?.add(1);
		drp2.drp?.add(2);
		await drp.merge(drp2.vertices);
		await drp2.merge(drp.vertices);
		expect(drp.drp?.query_value()).toBe(3);
		expect(drp2.drp?.query_value()).toBe(3);

		drp.drp?.add(3);
		drp2.drp?.mul(2);
		await drp.merge(drp2.vertices);
		await drp2.merge(drp.vertices);
		expect(drp.drp?.query_value()).toBe(12);
		expect(drp2.drp?.query_value()).toBe(12);
	});

	test("Test: Swap", async () => {
		// set initial shared value to 5
		drp.drp?.add(5);
		await drp.merge(drp2.vertices);
		await drp2.merge(drp.vertices);

		drp.drp?.mul(5);
		drp2.drp?.add(5);
		await drp.merge(drp2.vertices);
		await drp2.merge(drp.vertices);
		expect(drp.drp?.query_value()).toBe(50);
		expect(drp2.drp?.query_value()).toBe(50);

		drp2.drp?.mul(2);
		drp.drp?.add(2);
		await drp.merge(drp2.vertices);
		await drp2.merge(drp.vertices);
		expect(drp.drp?.query_value()).toBe(104);
		expect(drp2.drp?.query_value()).toBe(104);
	});

	test("Test: Multiple Operations", async () => {
		// set initial shared value to 5
		drp.drp?.add(5);
		await drp.merge(drp2.vertices);
		await drp2.merge(drp.vertices);

		drp.drp?.add(5);
		drp.drp?.add(6);
		drp2.drp?.mul(3);
		await drp.merge(drp2.vertices);
		await drp2.merge(drp.vertices);

		expect(drp.drp?.query_value()).toBe(48);
		expect(drp2.drp?.query_value()).toBe(48);
	});

	test("Test: Multiple Operations 2", async () => {
		// set initial shared value to 5
		drp.drp?.add(5);
		await drp.merge(drp2.vertices);
		await drp2.merge(drp.vertices);
		drp.drp?.mul(5);
		drp.drp?.add(5);
		drp2.drp?.add(5);
		await drp.merge(drp2.vertices);
		await drp2.merge(drp.vertices);
		expect(drp.drp?.query_value()).toBe(75);
		expect(drp2.drp?.query_value()).toBe(75);

		drp2.drp?.mul(2);
		vi.setSystemTime(new Date(Date.UTC(1998, 11, 24)));
		drp2.drp?.add(2);
		vi.setSystemTime(new Date(Date.UTC(1998, 11, 25)));
		drp.drp?.add(3);
		vi.setSystemTime(new Date(Date.UTC(1998, 11, 26)));
		drp.drp?.mul(3);
		await drp.merge(drp2.vertices);
		await drp2.merge(drp.vertices);
		expect(drp.drp?.query_value()).toBe(480);
		expect(drp2.drp?.query_value()).toBe(480);
	});
});

describe("Test: ActionTypes (Drops)", () => {
	test("Test: DropLeft", () => {});

	test("Test: DropRight", () => {});

	test("Test: Drop", () => {});
});
