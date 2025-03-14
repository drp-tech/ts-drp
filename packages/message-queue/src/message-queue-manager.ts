import type { IMessageQueueManager, IMessageQueueManagerOptions } from "@ts-drp/types";

import { MessageQueue } from "./message-queue.js";

export class MessageQueueManager<T> implements IMessageQueueManager<T> {
	private readonly options: IMessageQueueManagerOptions;
	private queues: Map<string, MessageQueue<T>>;

	constructor(options: IMessageQueueManagerOptions = {}) {
		this.options = {
			maxQueues: options.maxQueues ?? 1000,
		};
		this.queues = new Map();
	}

	async enqueue(queueId: string, message: T): Promise<void> {
		const queue = this.queues.get(queueId);
		if (!queue) {
			this.queues.set(queueId, new MessageQueue<T>());
		}
		await this.queues.get(queueId)?.enqueue(message);
	}

	async subscribe(queueId: string, handler: (message: T) => Promise<void>): Promise<void> {
		const queue = this.queues.get(queueId);
		if (!queue) {
			this.queues.set(queueId, new MessageQueue<T>());
		}
		await this.queues.get(queueId)?.subscribe(handler);
	}
}
