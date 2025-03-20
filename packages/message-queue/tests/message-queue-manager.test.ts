import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessageQueueManager } from "../src/message-queue-manager.js";

describe("MessageQueueManager", () => {
	let manager: MessageQueueManager<string>;

	beforeEach(() => {
		manager = new MessageQueueManager<string>();
	});

	afterEach(async () => {});

	describe("basic functionality", () => {
		it("should create and use queues", async () => {
			const queueId = "test-queue";
			const messages: string[] = [];
			let resolveHandler: () => void;
			const handlerPromise = new Promise<void>((resolve) => {
				resolveHandler = resolve;
			});

			const handler = vi.fn(async (msg: string) => {
				messages.push(msg);
				resolveHandler();
				return Promise.resolve();
			});

			// Start subscription
			manager.subscribe(queueId, handler);

			// Send message
			await manager.enqueue(queueId, "test");

			// Wait for message to be processed
			await handlerPromise;

			// Close queue
			manager.close(queueId);

			expect(messages).toEqual(["test"]);
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("should handle multiple queues", async () => {
			const queue1Id = "queue1";
			const queue2Id = "queue2";
			const messages1: string[] = [];
			const messages2: string[] = [];

			let resolveHandler1: () => void;
			let resolveHandler2: () => void;
			const handler1Promise = new Promise<void>((resolve) => {
				resolveHandler1 = resolve;
			});
			const handler2Promise = new Promise<void>((resolve) => {
				resolveHandler2 = resolve;
			});

			const handler1 = vi.fn(async (msg: string) => {
				messages1.push(msg);
				resolveHandler1();
				return Promise.resolve();
			});
			const handler2 = vi.fn(async (msg: string) => {
				messages2.push(msg);
				resolveHandler2();
				return Promise.resolve();
			});

			// Start subscriptions
			manager.subscribe(queue1Id, handler1);
			manager.subscribe(queue2Id, handler2);

			// Send messages to different queues
			await manager.enqueue(queue1Id, "queue1-message");
			await manager.enqueue(queue2Id, "queue2-message");

			// Wait for messages to be processed
			await Promise.all([handler1Promise, handler2Promise]);

			// Close queues
			manager.close(queue1Id);
			manager.close(queue2Id);

			expect(messages1).toEqual(["queue1-message"]);
			expect(messages2).toEqual(["queue2-message"]);
			expect(handler1).toHaveBeenCalledTimes(1);
			expect(handler2).toHaveBeenCalledTimes(1);
		});
	});

	describe("general queue", () => {
		it("should use general queue for empty queue ID", async () => {
			const messages: string[] = [];
			let resolveHandler: () => void;
			const handlerPromise = new Promise<void>((resolve) => {
				resolveHandler = resolve;
			});

			const handler = vi.fn(async (msg: string) => {
				messages.push(msg);
				resolveHandler();
				return Promise.resolve();
			});

			// Start subscription
			manager.subscribe("", handler);

			// Send message to empty queue ID
			await manager.enqueue("", "test");

			// Wait for message to be processed
			await handlerPromise;

			// Close queue
			manager.close("");

			expect(messages).toEqual(["test"]);
			expect(handler).toHaveBeenCalledTimes(1);
		});
	});

	describe("queue limits", () => {
		it("should respect maxQueues limit", () => {
			const smallManager = new MessageQueueManager<string>({ maxQueues: 2 });
			const queue1Id = "queue1";
			const queue2Id = "queue2";
			const queue3Id = "queue3";
			const handler = vi.fn();

			// Create first two queues
			smallManager.subscribe(queue1Id, handler);
			smallManager.subscribe(queue2Id, handler);

			// Try to create third queue
			expect(() => smallManager.subscribe(queue3Id, handler)).toThrow("Max number of queues reached");

			smallManager.closeAll();
		});

		it("should log error when enqueueing to non-existent queue", async () => {
			const smallManager = new MessageQueueManager<string>({ maxQueues: 2 });
			const queue1Id = "queue1";
			const queue2Id = "queue2";
			const queue3Id = "queue3";

			// Spy on the logger's error method
			const loggerSpy = vi.spyOn(smallManager["logger"], "error");

			// Create first two queues via subscription
			smallManager.subscribe(queue1Id, vi.fn());
			smallManager.subscribe(queue2Id, vi.fn());

			// Try to enqueue to a third queue that doesn't exist
			await smallManager.enqueue(queue3Id, "test3");

			// Verify logger was called with appropriate message
			expect(loggerSpy).toHaveBeenCalledWith(`queue manager::enqueue: queue ${queue3Id} not found`);

			smallManager.closeAll();
		});
	});

	describe("queue management", () => {
		it("should close specific queue", async () => {
			const queueId = "test-queue";
			const messages: string[] = [];
			let resolveHandler: () => void;
			const handlerPromise = new Promise<void>((resolve) => {
				resolveHandler = resolve;
			});

			const handler = vi.fn(async (msg: string) => {
				messages.push(msg);
				resolveHandler();
				return Promise.resolve();
			});

			// Start subscription
			manager.subscribe(queueId, handler);

			// Send message
			await manager.enqueue(queueId, "test");

			// Wait for message to be processed
			await handlerPromise;

			// Close specific queue
			manager.close(queueId);

			expect(messages).toEqual(["test"]);
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("should close all queues", async () => {
			const numberOfQueues = 10;
			const messages: string[] = [];
			const handlerPromises: Promise<void>[] = [];

			const handler = vi.fn(async (msg: string): Promise<void> => {
				await Promise.resolve();
				messages.push(msg);
			});

			// Create a wrapper that tracks the promise from each handler call.
			const handlerWrapper = (msg: string): Promise<void> => {
				const p = handler(msg);
				handlerPromises.push(p);
				return p;
			};

			// Subscribe to each queue using the wrapper.
			for (let i = 0; i < numberOfQueues; i++) {
				manager.subscribe(`queue${i}`, handlerWrapper);
			}

			// Enqueue a message to each queue.
			for (let i = 0; i < numberOfQueues; i++) {
				await manager.enqueue(`queue${i}`, `test${i}`);
			}

			// Wait until all handler promises have resolved.
			await Promise.all(handlerPromises);

			// Close all queues.
			manager.closeAll();

			expect(messages).toEqual(Array.from({ length: numberOfQueues }, (_, i) => `test${i}`));
			expect(handler).toHaveBeenCalledTimes(numberOfQueues);
		});
	});

	describe("one queue multiple handlers", () => {
		it("should handle multiple handlers", async () => {
			const queueId = "test-queue";
			const messages: string[] = [];

			// Create promises that resolve when each handler is called.
			let resolveHandler1: () => void;
			let resolveHandler2: () => void;
			const handler1Called = new Promise<void>((resolve) => {
				resolveHandler1 = resolve;
			});
			const handler2Called = new Promise<void>((resolve) => {
				resolveHandler2 = resolve;
			});

			// Remove the artificial delay and simply resolve the corresponding promise.
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

			manager.subscribe(queueId, handler1);
			manager.subscribe(queueId, handler2);

			await manager.enqueue(queueId, "test");

			// Wait until both handlers have been called.
			await Promise.all([handler1Called, handler2Called]);
			manager.close(queueId);

			expect(messages).toEqual(["test", "test"]);
			expect(handler1).toHaveBeenCalledTimes(1);
			expect(handler2).toHaveBeenCalledTimes(1);
		});
	});
});
