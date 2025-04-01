import { Message, MessageType } from "@ts-drp/types";
import { afterEach } from "node:test";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { handleMessage } from "../src/handlers.js";
import { DRPNode } from "../src/index.js";
import { log } from "../src/logger.js";

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

describe("Messages validation tests", () => {
	let node: DRPNode;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let logSpy: any;
	beforeEach(async () => {
		node = new DRPNode();
		await node.start();
		logSpy = vi.spyOn(log, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	test("Should not receive message from an empty sender", async () => {
		const message = Message.create({
			sender: "",
			type: MessageType.UNRECOGNIZED,
			data: new Uint8Array(),
			objectId: "object",
		});

		await handleMessage(node, message);
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("::messageHandler: Invalid message format"));
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("A valid sender must be provided"));
	});

	test("Should not receive message with invalid message type", async () => {
		const message = Message.create({
			sender: "sender",
			// @ts-expect-error -- invalid message type
			type: 100,
			data: new Uint8Array(),
			objectId: "object",
		});

		await handleMessage(node, message);
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("::messageHandler: Invalid message format"));
	});

	test("Should not receive message with an empty object id", async () => {
		const message = Message.create({
			sender: "sender",
			type: MessageType.UNRECOGNIZED,
			data: new Uint8Array(),
			objectId: "",
		});
		await handleMessage(node, message);
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("::messageHandler: Invalid message format"));
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("A valid object id must be provided"));
	});

	test("Should receive message with a valid message format", async () => {
		const message = Message.create({
			sender: "sender",
			type: MessageType.UNRECOGNIZED,
			data: new Uint8Array(),
			objectId: "object",
		});
		await handleMessage(node, message);
		expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("::messageHandler: Invalid message format"));
	});
});
