import { MessageQueueEvent } from "@ts-drp/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MessageQueue } from "../src/message-queue.js";

describe("MessageQueue tests", () => {
	let queue: MessageQueue<string>;

	beforeEach(() => {
		queue = new MessageQueue<string>();
	});

	describe("Initialization", () => {
		it("Should create queue with default options", () => {
			expect(queue).toBeInstanceOf(MessageQueue);
		});

		it("Should create queue with custom options", () => {
			const customQueue = new MessageQueue<string>({
				maxSize: 5,
				dropOnFull: true,
			});
			expect(customQueue).toBeInstanceOf(MessageQueue);
		});
	});

	describe("Enqueue", () => {
		it("Should successfully enqueue a message", () => {
			const result = queue.enqueue("test message");
			expect(result).toBe(true);
		});

		it("Should emit MessageQueueEvent.Full when queue is full", () => {
			const smallQueue = new MessageQueue<string>({ maxSize: 2 });
			const fullSpy = vi.fn();

			smallQueue.on(MessageQueueEvent.Full, fullSpy);

			smallQueue.enqueue("message1");
			smallQueue.enqueue("message2");
			smallQueue.enqueue("message3");

			expect(fullSpy).toHaveBeenCalled();
		});

		it("Should drop messages when queue is full and dropOnFull is true", () => {
			const smallQueue = new MessageQueue<string>({
				maxSize: 2,
				dropOnFull: true,
			});

			const results = [
				smallQueue.enqueue("message1"),
				smallQueue.enqueue("message2"),
				smallQueue.enqueue("message3"),
			];

			expect(results).toEqual([true, true, false]);
		});
	});

	describe("Message processing", () => {
		it("Should process messages in order", () => {
			const messages = ["first", "second", "third"];
			const processed: string[] = [];

			queue.on(MessageQueueEvent.Processing, (message: string) => {
				processed.push(message);
				if (processed.length === messages.length) {
					expect(processed).toEqual(messages);
				}
			});

			queue.start();
			messages.forEach((msg) => queue.enqueue(msg));
		});

		it("Should stop processing when stopped", () => {
			const processingSpy = vi.fn();
			queue.on(MessageQueueEvent.Processing, processingSpy);

			queue.enqueue("test");
			queue.stop();
			expect(processingSpy).not.toHaveBeenCalled();
			queue.start();
			expect(processingSpy).toHaveBeenCalled();
		});

		it("Should handle errors during processing", () => {
			queue.on(MessageQueueEvent.Processing, () => {
				throw new Error("Processing error");
			});

			queue.on(MessageQueueEvent.Error, ({ message, error }) => {
				expect(message).toBe("test message");
				expect(error).toBeInstanceOf(Error);
				expect(error.message).toBe("Processing error");
				return;
			});

			queue.start();
			queue.enqueue("test message");
		});

		it("Should continue processing after an error", () => {
			const messages = ["error", "success"];
			const processed: string[] = [];

			queue.on(MessageQueueEvent.Processing, (message: string) => {
				if (message === "error") {
					throw new Error("Processing error");
				}
				processed.push(message);
				if (processed.length === 1) {
					expect(processed).toEqual(["success"]);
					return;
				}
			});

			queue.start();
			messages.forEach((msg) => queue.enqueue(msg));
		});
	});

	describe("Queue management", () => {
		it("Should clear the queue", () => {
			queue.enqueue("message1");
			queue.enqueue("message2");
			queue.clear();

			const processingHandler = vi.fn();
			queue.on(MessageQueueEvent.Processing, processingHandler);
			queue.start();

			expect(processingHandler).not.toHaveBeenCalled();
		});

		it("Should maintain correct head position after processing", () => {
			const smallQueue = new MessageQueue<string>({ maxSize: 3 });
			const messages = ["1", "2", "3"];
			let processed = 0;

			smallQueue.on(MessageQueueEvent.Processing, (message: string) => {
				expect(message).toBe(messages[processed]);
				processed++;
				if (processed === messages.length) {
					return;
				}
			});

			smallQueue.start();
			messages.forEach((msg) => smallQueue.enqueue(msg));
		});

		it("Should handle rapid enqueue/dequeue operations", () => {
			const operations = 100;
			let processed = 0;

			queue.on(MessageQueueEvent.Processing, () => {
				processed++;
				if (processed === operations) {
					return;
				}
			});

			queue.start();
			for (let i = 0; i < operations; i++) {
				queue.enqueue(`message${i}`);
			}
		});
	});

	describe("Event handling", () => {
		it("Should emit correct sequence of events for successful processing", () => {
			const events: string[] = [];
			const expectedSequence = [MessageQueueEvent.Started, MessageQueueEvent.Processing];

			queue.on(MessageQueueEvent.Started, () => events.push(MessageQueueEvent.Started));
			queue.on(MessageQueueEvent.Processing, () => {
				events.push(MessageQueueEvent.Processing);
				expect(events).toEqual(expectedSequence);
				return;
			});

			queue.enqueue("test");
			queue.start();
		});

		it("Should emit error event with correct error details", () => {
			const testError = new Error("Test error");
			const testMessage = "test message";

			queue.on(MessageQueueEvent.Processing, () => {
				throw testError;
			});

			queue.on(MessageQueueEvent.Error, ({ message, error }) => {
				expect(message).toBe(testMessage);
				expect(error).toBe(testError);
				return;
			});

			queue.start();
			queue.enqueue(testMessage);
		});
	});
});
