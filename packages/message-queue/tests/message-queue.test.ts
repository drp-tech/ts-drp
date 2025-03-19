import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessageQueue } from "../src/message-queue.js";

describe("MessageQueue", () => {
	let queue: MessageQueue<string>;
	let messages: string[] = [];
	const handler = vi.fn(async (msg: string) => {
		await new Promise((resolve) => setTimeout(resolve, 100));
		messages.push(msg);
	});

	beforeEach(() => {
		queue = new MessageQueue<string>();
		messages = [];
	});

	afterEach(async () => {});

	describe("basic functionality", () => {
		it("should process messages in order", async () => {
			// Start subscription before enqueueing
			queue.subscribe(handler);

			// Enqueue messages
			await queue.enqueue("first");
			await queue.enqueue("second");
			await queue.enqueue("third");

			// Wait for messages to be processed
			await new Promise((resolve) => setTimeout(resolve, 100 * 4));
			// Close queue to stop subscription
			queue.close();

			expect(messages).toEqual(["first", "second", "third"]);
			expect(handler).toHaveBeenCalledTimes(3);
		});
	});

	describe("error handling", () => {
		it("should throw error when enqueueing to closed queue", async () => {
			queue.close();
			await expect(queue.enqueue("test")).rejects.toThrow("Message queue is closed");
		});
	});

	describe("queue closing", () => {
		it("should stop processing messages after closing", async () => {
			const messages: string[] = [];
			const handler = vi.fn(async (msg: string) => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				messages.push(msg);
			});

			queue.subscribe(handler);

			// Enqueue a message
			await queue.enqueue("test");

			// Wait for message to be processed
			await new Promise((resolve) => setTimeout(resolve, 100 * 2));

			// Close queue
			queue.close();

			// Try to enqueue after closing
			await expect(queue.enqueue("after-close")).rejects.toThrow("Message queue is closed");

			expect(messages).toEqual(["test"]);
			expect(handler).toHaveBeenCalledTimes(1);
		});
	});
});
