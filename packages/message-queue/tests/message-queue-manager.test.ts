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
			const handler = vi.fn(async (msg: string) => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				messages.push(msg);
			});

			// Start subscription
			manager.subscribe(queueId, handler);

			// Send message
			await manager.enqueue(queueId, "test");

			// Wait for message to be processed
			await new Promise((resolve) => setTimeout(resolve, 100));

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
			const handler1 = vi.fn(async (msg: string) => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				messages1.push(msg);
			});
			const handler2 = vi.fn(async (msg: string) => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				messages2.push(msg);
			});

			// Start subscriptions
			manager.subscribe(queue1Id, handler1);
			manager.subscribe(queue2Id, handler2);

			// Send messages to different queues
			await manager.enqueue(queue1Id, "queue1-message");
			await manager.enqueue(queue2Id, "queue2-message");

			// Wait for messages to be processed
			await new Promise((resolve) => setTimeout(resolve, 100));

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
			const handler = vi.fn(async (msg: string) => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				messages.push(msg);
			});

			// Start subscription
			manager.subscribe("", handler);

			// Send message to empty queue ID
			await manager.enqueue("", "test");

			// Wait for message to be processed
			await new Promise((resolve) => setTimeout(resolve, 100));
			// Close queue
			manager.close("");

			expect(messages).toEqual(["test"]);
			expect(handler).toHaveBeenCalledTimes(1);
		});
	});

	describe("queue limits", () => {
		it("should respect maxQueues limit", async () => {
			const smallManager = new MessageQueueManager<string>({ maxQueues: 2 });
			const queue1Id = "queue1";
			const queue2Id = "queue2";
			const queue3Id = "queue3";

			// Create first two queues
			await smallManager.enqueue(queue1Id, "test1");
			await smallManager.enqueue(queue2Id, "test2");

			// Try to create third queue
			await expect(smallManager.enqueue(queue3Id, "test3")).rejects.toThrow(
				"Max number of queues reached"
			);

			smallManager.closeAll();
		});
	});

	describe("queue management", () => {
		it("should close specific queue", async () => {
			const queueId = "test-queue";
			const messages: string[] = [];
			const handler = vi.fn(async (msg: string) => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				messages.push(msg);
			});

			// Start subscription
			manager.subscribe(queueId, handler);

			// Send message
			await manager.enqueue(queueId, "test");

			// Wait for message to be processed
			await new Promise((resolve) => setTimeout(resolve, 100));
			// Close specific queue
			manager.close(queueId);

			expect(messages).toEqual(["test"]);
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("should close all queues", async () => {
			const numberOfQueues = 10;
			const messages: string[] = [];
			const handler = vi.fn(async (msg: string) => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				messages.push(msg);
			});

			for (let i = 0; i < numberOfQueues; i++) {
				manager.subscribe(`queue${i}`, handler);
			}

			// Send messages
			for (let i = 0; i < numberOfQueues; i++) {
				await manager.enqueue(`queue${i}`, `test${i}`);
			}

			// Wait for messages to be processed
			await new Promise((resolve) => setTimeout(resolve, 100 * numberOfQueues));

			// Close all queues
			manager.closeAll();

			expect(messages).toEqual(Array.from({ length: numberOfQueues }, (_, i) => `test${i}`));
			expect(handler).toHaveBeenCalledTimes(numberOfQueues);
		});
	});
});
