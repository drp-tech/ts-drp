import { Logger } from "@ts-drp/logger";
import type { IMessageQueueManager, IMessageQueueManagerOptions } from "@ts-drp/types";

import { MessageQueue } from "./message-queue.js";

export const GENERAL_QUEUE_ID = "general";

export class MessageQueueManager<T> implements IMessageQueueManager<T> {
	private readonly options: Required<IMessageQueueManagerOptions>;
	private queues: Map<string, MessageQueue<T>>;
	private logger: Logger;

	constructor(options: IMessageQueueManagerOptions = {}) {
		this.options = {
			maxQueues: (options.maxQueues ?? 100) + 1, // +1 for the general queue
			maxQueueSize: options.maxQueueSize ?? 1000,
			logConfig: options.logConfig ?? {
				level: "info",
			},
		};
		this.queues = new Map();
		this.queues.set(GENERAL_QUEUE_ID, new MessageQueue<T>({ maxSize: this.options.maxQueueSize }));
		this.logger = new Logger("drp::message-queue-manager", options.logConfig);
	}

	async enqueue(queueId: string, message: T): Promise<void> {
		if (queueId === "") {
			queueId = GENERAL_QUEUE_ID;
		}
		const queue = this.queues.get(queueId);
		if (!queue) {
			this.logger.error(`queue manager::enqueue: queue ${queueId} not found`);
			return;
		}
		await queue.enqueue(message);
		this.logger.info(`queue manager::enqueued message ${message} to ${queueId}`);
	}

	subscribe(queueId: string, handler: (message: T) => Promise<void>): void {
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
		this.queues.get(queueId)?.subscribe(handler);
		console.log(`queue manager::subscribed to ${queueId}`);
	}

	close(queueId: string): void {
		if (queueId === "") {
			queueId = GENERAL_QUEUE_ID;
		}
		const queue = this.queues.get(queueId);
		if (!queue) {
			return;
		}
		queue.close();
	}

	closeAll(): void {
		for (const queue of this.queues.values()) {
			queue.close();
		}
	}
}
