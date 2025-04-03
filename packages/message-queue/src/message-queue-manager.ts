import { Logger } from "@ts-drp/logger";
import type { IMessageQueueHandler, IMessageQueueManager, IMessageQueueManagerOptions } from "@ts-drp/types";

import { MessageQueue } from "./message-queue.js";

export const GENERAL_QUEUE_ID = "general";

/**
 * MessageQueueManager is a class that manages a collection of MessageQueue instances.
 * It provides methods to enqueue messages, subscribe to queues, and close queues.
 * @template T - The type of messages that the queue will handle
 */
export class MessageQueueManager<T> implements IMessageQueueManager<T> {
	private readonly options: Required<IMessageQueueManagerOptions>;
	private queues: Map<string, MessageQueue<T>>;
	private logger: Logger;

	/**
	 * Constructor for MessageQueueManager
	 * @param options - The options for the message queue manager
	 */
	constructor(options: IMessageQueueManagerOptions = {}) {
		this.options = this.getOptions(options);
		this.queues = new Map();
		this.createQueue(GENERAL_QUEUE_ID);
		this.logger = new Logger("drp::message-queue-manager", options.logConfig);
	}

	private getOptions(options: IMessageQueueManagerOptions): Required<IMessageQueueManagerOptions> {
		return {
			maxQueues: (options.maxQueues ?? 100) + 1, // +1 for the general queue
			maxQueueSize: options.maxQueueSize ?? 1000,
			logConfig: options.logConfig ?? { level: "info" },
		};
	}

	private createQueue(queueId: string): MessageQueue<T> {
		const queue = new MessageQueue<T>({
			id: queueId,
			maxSize: this.options.maxQueueSize,
			logConfig: this.options.logConfig,
		});
		this.queues.set(queueId, queue);
		return queue;
	}

	/**
	 * Enqueue a message to a specific queue
	 * @param queueId - The id of the queue to enqueue the message to
	 * @param message - The message to enqueue
	 */
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
		this.logger.trace(`queue manager::enqueued message ${message} to ${queueId}`);
	}

	/**
	 * Subscribe to a specific queue
	 * @param queueId - The id of the queue to subscribe to
	 * @param handler - The handler to apply to each message received
	 */
	subscribe(queueId: string, handler: IMessageQueueHandler<T>): void {
		if (queueId === "") {
			queueId = GENERAL_QUEUE_ID;
		}
		const queue = this.queues.get(queueId);
		if (!queue) {
			if (this.queues.size >= this.options.maxQueues) {
				throw new Error("Max number of queues reached");
			}
			this.createQueue(queueId);
		}
		this.queues.get(queueId)?.subscribe(handler);
		this.logger.info(`queue manager::subscribed to ${queueId}`);
	}

	/**
	 * Close a specific queue
	 * @param queueId - The id of the queue to close
	 */
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

	/**
	 * Close all queues
	 */
	closeAll(): void {
		for (const queue of this.queues.values()) {
			queue.close();
		}
	}
}
