import type { IMessageQueueManager, IMessageQueueManagerOptions } from "@ts-drp/types";

import { MessageQueue } from "./message-queue.js";

export const GENERAL_QUEUE_ID = "general";

export class MessageQueueManager<T> implements IMessageQueueManager<T> {
	private readonly options: Required<IMessageQueueManagerOptions>;
	private queues: Map<string, MessageQueue<T>>;

	constructor(options: IMessageQueueManagerOptions = {}) {
		this.options = {
			maxQueues: (options.maxQueues ?? 100) + 1, // +1 for the general queue
			maxQueueSize: options.maxQueueSize ?? 1000,
		};
		this.queues = new Map();
		this.queues.set(GENERAL_QUEUE_ID, new MessageQueue<T>({ maxSize: this.options.maxQueueSize }));
	}

	async enqueue(queueId: string, message: T): Promise<void> {
		if (queueId === "") {
			queueId = GENERAL_QUEUE_ID;
		}
		const queue = this.queues.get(queueId);
		if (!queue) {
			if (this.queues.size < this.options.maxQueues) {
				this.queues.set(queueId, new MessageQueue<T>({ maxSize: this.options.maxQueueSize }));
			} else {
				throw new Error("Max number of queues reached");
			}
		}
		await this.queues.get(queueId)?.enqueue(message);
	}

	async subscribe(queueId: string, handler: (message: T) => Promise<void>): Promise<void> {
		if (queueId === "") {
			queueId = GENERAL_QUEUE_ID;
		}
		const queue = this.queues.get(queueId);
		if (!queue) {
			if (this.queues.size < this.options.maxQueues) {
				this.queues.set(queueId, new MessageQueue<T>({ maxSize: this.options.maxQueueSize }));
			} else {
				throw new Error("Max number of queues reached");
			}
		}
		await this.queues.get(queueId)?.subscribe(handler);
	}

	async close(queueId: string): Promise<void> {
		if (queueId === "") {
			queueId = GENERAL_QUEUE_ID;
		}
		const queue = this.queues.get(queueId);
		if (!queue) {
			return;
		}
		await queue.close();
	}

	async closeAll(): Promise<void> {
		for (const queue of this.queues.values()) {
			await queue.close();
		}
	}
}
