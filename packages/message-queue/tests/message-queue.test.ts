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

	describe("queue multiple handlers", () => {
		it("should process messages in order", async () => {
			const messages: string[] = [];
			let resolveHandler1: () => void;
			let resolveHandler2: () => void;
			const handler1Promise = new Promise<void>((resolve) => {
				resolveHandler1 = resolve;
			});
			const handler2Promise = new Promise<void>((resolve) => {
				resolveHandler2 = resolve;
			});

			const handler1 = vi.fn(async (msg: string) => {
				await Promise.resolve();
				messages.push(msg);
				resolveHandler1();
			});

			const handler2 = vi.fn(async (msg: string) => {
				await Promise.resolve();
				messages.push(msg);
				resolveHandler2();
			});

			queue.subscribe(handler1);
			queue.subscribe(handler2);

			await queue.enqueue("test");

			await Promise.all([handler1Promise, handler2Promise]);
			queue.close();

			expect(messages).toEqual(["test", "test"]);
			expect(handler1).toHaveBeenCalledTimes(1);
			expect(handler2).toHaveBeenCalledTimes(1);
		});
	});
});
