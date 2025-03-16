import type { IMessageQueueManager, IMessageQueueManagerOptions } from "@ts-drp/types";

import { MessageQueue } from "./message-queue.js";

export const GENERAL_QUEUE_ID = "general";

export class MessageQueueManager<T> implements IMessageQueueManager<T> {
	private readonly options: IMessageQueueManagerOptions;
	private queues: Map<string, MessageQueue<T>>;

	constructor(options: IMessageQueueManagerOptions = {}) {
		this.options = {
			maxQueues: options.maxQueues ?? 100,
		};
		this.queues = new Map();
		this.queues.set(GENERAL_QUEUE_ID, new MessageQueue<T>({ maxSize: this.options.maxQueues }));
	}

	async enqueue(queueId: string, message: T): Promise<void> {
		if (queueId === "") {
			queueId = GENERAL_QUEUE_ID;
		}
		const queue = this.queues.get(queueId);
		if (!queue) {
			this.queues.set(queueId, new MessageQueue<T>({ maxSize: this.options.maxQueues }));
		}
		await this.queues.get(queueId)?.enqueue(message);
	}

	async subscribe(queueId: string, handler: (message: T) => Promise<void>): Promise<void> {
		const queue = this.queues.get(queueId);
		if (!queue) {
			this.queues.set(queueId, new MessageQueue<T>({ maxSize: this.options.maxQueues }));
		}
		await this.queues.get(queueId)?.subscribe(handler);
	}

	async close(queueId: string): Promise<void> {
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
