import type { LoggerOptions } from "./logger.js";

/**
 * Options for the message queue.
 */
export interface IMessageQueueOptions {
	id: string; // The id of the queue
	maxSize?: number; // Maximum number of messages in the queue
	logConfig?: LoggerOptions;
}

/**
 * A handler for the message queue.
 */
export interface IMessageQueueHandler<T> {
	(message: T): Promise<void>;
}

/**
 * A message queue.
 */
export interface IMessageQueue<T> {
	/**
	 * Enqueue a new message and process it if queue is active
	 * @param message The message to enqueue
	 */
	enqueue(message: T): Promise<void>;

	/**
	 * Subscribe to the queue
	 * @param handler The handler to apply to each message received
	 */
	subscribe(handler: IMessageQueueHandler<T>): void;

	/**
	 * Close the queue
	 */
	close(): void;

	/**
	 * Start the queue
	 */
	start(): void;
}

export interface IMessageQueueManagerOptions {
	maxQueues?: number; // Maximum number of queues
	maxQueueSize?: number; // Maximum number of messages in each queue
	logConfig?: LoggerOptions;
}

export interface IMessageQueueManager<T> {
	/**
	 * Enqueue a new message and process it if queue is active
	 * @param queueId The queue to enqueue the message to
	 * @param message The message to enqueue
	 */
	enqueue(queueId: string, message: T): Promise<void>;

	/**
	 * Subscribe to the queue
	 * @param queueId The queue to subscribe to
	 * @param handler The handler to apply to each message received
	 */
	subscribe(queueId: string, handler: IMessageQueueHandler<T>): void;

	/**
	 * Close the queue
	 * @param queueId The queue to close
	 */
	close(queueId: string): void;

	/**
	 * Close all queues
	 */
	closeAll(): void;
}
