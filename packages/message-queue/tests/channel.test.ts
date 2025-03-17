import { describe, expect, it } from "vitest";

import { Channel } from "../src/channel.js";

describe("Channel", () => {
	describe("basic functionality", () => {
		it("should send and receive messages", async () => {
			const channel = new Channel<string>();
			const value = "test";

			const receivePromise = channel.receive();
			await channel.send(value);
			const received = await receivePromise;

			expect(received).toBe(value);
		});

		it("should handle multiple messages in order", async () => {
			const channel = new Channel<string>();
			const values = ["first", "second", "third"];
			const received: string[] = [];

			// Start receiving before sending
			const receivePromises = values.map(() => channel.receive());
			for (const value of values) {
				await channel.send(value);
			}

			for (const promise of receivePromises) {
				received.push(await promise);
			}

			expect(received).toEqual(values);
		});

		it("should handle multiple receivers", async () => {
			const channel = new Channel<string>();
			const value = "test";
			const received: string[] = [];

			// Start multiple receivers
			const receivePromises = [channel.receive(), channel.receive()];
			await channel.send(value);
			await channel.send(value);

			for (const promise of receivePromises) {
				received.push(await promise);
			}

			expect(received).toEqual([value, value]);
		});
	});

	describe("capacity", () => {
		it("should respect capacity limit", async () => {
			const channel = new Channel<string>({ capacity: 2 });
			const values = ["first", "second", "third"];
			const received: string[] = [];

			// Start receiving before sending
			const receivePromises = values.map(() => channel.receive());
			for (const value of values) {
				await channel.send(value);
			}

			for (const promise of receivePromises) {
				received.push(await promise);
			}

			expect(received).toEqual(values);
		});

		it("should await send when at capacity", async () => {
			const channel = new Channel<string>({ capacity: 1 });
			const value1 = "first";
			const value2 = "second";

			// Send first value
			await channel.send(value1);

			// Try to send second value immediately
			const sendPromise = channel.send(value2);
			const receivePromise1 = channel.receive();

			// Check if sendPromise is still pending (not resolved)
			const sendPromiseStatus = await Promise.race([
				sendPromise.then(() => "resolved"),
				Promise.resolve("pending"),
			]);
			expect(sendPromiseStatus).toBe("pending");

			const receivePromise2 = channel.receive();

			// Wait for both operations
			const [received1, received2] = await Promise.all([receivePromise1, receivePromise2]);

			expect(received1).toBe(value1);
			expect(received2).toBe(value2);
		});
	});

	describe("error handling", () => {
		it("should throw error on undefined value", async () => {
			const channel = new Channel<string>();
			const values: string[] = [undefined as unknown as string];

			await expect(channel.send(values[0])).rejects.toThrow(
				"Unexpected undefined value in channel"
			);
		});
	});

	describe("concurrent operations", () => {
		it("should handle concurrent send and receive", async () => {
			const channel = new Channel<string>();
			const value = "test";

			// Start both operations concurrently
			const [received] = await Promise.all([channel.receive(), channel.send(value)]);

			expect(received).toBe(value);
		});

		it("should handle multiple concurrent operations", async () => {
			const channel = new Channel<string>();
			const values = ["first", "second", "third"];
			const received: string[] = [];

			// Start multiple operations concurrently
			const operations = [
				...values.map((value) => channel.send(value)),
				...values.map(() => channel.receive()),
			];
			const results = await Promise.all(operations);
			received.push(
				...results.slice(values.length).filter((result): result is string => result !== undefined)
			);

			expect(received).toEqual(values);
		});
	});
});
