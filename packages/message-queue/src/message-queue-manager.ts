import type { IMessageQueueManager, IMessageQueueManagerOptions } from "@ts-drp/types";

import type { MessageQueue } from "./message-queue.js";

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
			throw new Error(`Queue ${queueId} not found`);
		}
		await queue.enqueue(message);
	}

	async subscribe(queueId: string, callback: (message: T) => Promise<void>): Promise<void> {
		const queue = this.queues.get(queueId);
		if (!queue) {
			throw new Error(`Queue ${queueId} not found`);
		}
		await queue.subscribe(callback);
	}
}
