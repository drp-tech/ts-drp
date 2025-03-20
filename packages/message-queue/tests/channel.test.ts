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
			const sendPromiseStatus = await Promise.race([sendPromise.then(() => "resolved"), Promise.resolve("pending")]);
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

			await expect(channel.send(values[0])).rejects.toThrow("Unexpected undefined value in channel");
		});

		it("should throw error when sending to a closed channel", async () => {
			const channel = new Channel<string>();
			channel.close();

			await expect(channel.send("test")).rejects.toThrow("Channel is closed");
		});

		it("should throw error when receiving from a closed empty channel", async () => {
			const channel = new Channel<string>();
			channel.close();

			await expect(channel.receive()).rejects.toThrow("Channel is closed");
		});

		it("should throw error when buffer has an unexpected undefined value", async () => {
			const channel = new Channel<string>();
			// Purposely inject undefined value using type assertion for testing error path
			(channel as unknown as { values: Array<string | undefined> }).values.push(undefined);

			await expect(channel.receive()).rejects.toThrow("Unexpected undefined value in channel");
		});
	});

	describe("close functionality", () => {
		it("should reject pending receives when channel is closed", async () => {
			const channel = new Channel<string>();
			const receivePromise = channel.receive();

			channel.close();

			await expect(receivePromise).rejects.toThrow("Channel is closed");
		});

		it("should allow receiving buffered values after closing", async () => {
			const channel = new Channel<string>();
			await channel.send("test");

			channel.close();

			const received = await channel.receive();
			expect(received).toBe("test");

			// After draining buffer, it should throw
			await expect(channel.receive()).rejects.toThrow("Channel is closed");
		});

		it("should allow receiving pending sends after closing", async () => {
			const channel = new Channel<string>({ capacity: 0 });

			// This will create a pending send
			const sendPromise = channel.send("test");

			// Close the channel (should still allow the pending send to complete)
			channel.close();

			// We should still be able to receive the pending send
			const received = await channel.receive();
			expect(received).toBe("test");

			// But new receives should fail
			await expect(channel.receive()).rejects.toThrow("Channel is closed");

			// The send should complete
			await sendPromise;
		});

		it("should throw error when channel is closed during waiting for send", async () => {
			const channel = new Channel<string>();

			// Start a receive that will have to wait (no values or pending sends)
			const receivePromise = channel.receive();

			// Small delay to ensure the receive is waiting
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Close the channel
			channel.close();

			// The receive should be rejected
			await expect(receivePromise).rejects.toThrow("Channel is closed");
		});
	});

	describe("waiting for messages", () => {
		it("should wait for a send when there are no values or pending sends", async () => {
			const channel = new Channel<string>();
			const value = "test";

			// Start a receive that will have to wait
			const receivePromise = channel.receive();

			// Send a value which should resolve the waiting receive
			await channel.send(value);

			// The receive should complete with the value
			const received = await receivePromise;
			expect(received).toBe(value);
		});

		it("should directly return signal.promise when waiting for a message", async () => {
			// Using zero capacity to ensure we hit the waiting path
			const channel = new Channel<string>({ capacity: 0 });

			// Start receive that will wait
			const receivePromise = channel.receive();

			void channel.send("test");

			const received = await receivePromise;
			expect(received).toBe("test");
		});
	});

	describe("edge cases", () => {
		it("should throw when closed with capacity zero after draining pending sends", async () => {
			// Using zero capacity to ensure we test direct passing between send/receive
			const channel = new Channel<string>({ capacity: 0 });

			// Create a pending send
			const sendPromise = channel.send("test");

			// Close the channel
			channel.close();

			// First receive works (gets the pending send)
			const received = await channel.receive();
			expect(received).toBe("test");

			// Second receive should fail with channel closed
			await expect(channel.receive()).rejects.toThrow("Channel is closed");

			// Make sure send resolves
			await sendPromise;
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
			const operations = [...values.map((value) => channel.send(value)), ...values.map(() => channel.receive())];
			const results = await Promise.all(operations);
			received.push(...results.slice(values.length).filter((result): result is string => result !== undefined));

			expect(received).toEqual(values);
		});
	});
});
