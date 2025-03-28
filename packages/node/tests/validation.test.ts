import { beforeEach, describe, expect, test } from "vitest";

import { DRPNode } from "../src/index.js";

describe("Creating object validation tests", () => {
	let node1: DRPNode;
	let node2: DRPNode;
	beforeEach(async () => {
		node1 = new DRPNode();
		node2 = new DRPNode();
		await node2.start();
	});

	test("Should not able to create object before starting", async () => {
		await expect(node1.createObject({})).rejects.toThrow("Node not started");
	});

	test("Should not able to connect object before starting", async () => {
		await expect(node1.connectObject({ id: "object" })).rejects.toThrow("Node not started");
	});

	test("Should be able to create object without id", async () => {
		const dprObject = await node2.createObject({});
		expect(dprObject.id).toBeDefined();
	});

	test("Should be able to create object with a valid id", async () => {
		const dprObject = await node2.createObject({ id: "object1" });
		expect(dprObject.id).toBe("object1");
	});

	test("Should not able to create object with an empty id", async () => {
		await expect(node2.createObject({ id: "" })).rejects.toThrow("A valid object id must be provided");
	});

	test("Should not able to create object and sync with an empty peerId", async () => {
		await expect(
			node2.createObject({
				id: "object1",
				sync: {
					enabled: true,
					peerId: "",
				},
			})
		).rejects.toThrow("A valid peer id must be provided");
	});

	test("Should not able to connect object with an empty peerId", async () => {
		await expect(
			node2.connectObject({
				id: "",
			})
		).rejects.toThrow("A valid object id must be provided");
	});

	test("Should not able to connect object and sync with an empty peerId", async () => {
		await expect(
			node2.connectObject({
				id: "object1",
				sync: {
					peerId: "",
				},
			})
		).rejects.toThrow("A valid peer id must be provided");
	});
});
