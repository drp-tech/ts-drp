/**
 * Options for the message queue.
 */
export interface IMessageQueueOptions {
	maxSize?: number; // Maximum number of messages in the queue
	dropOnFull?: boolean; // Whether to drop new messages when queue is full
}

/**
 * A message queue.
 */
export interface IMessageQueue<T> {
	/**
	 * Enqueue a new message and process it if queue is active
	 * @param message The message to enqueue
	 */
	enqueue(message: unknown): Promise<void>;

	/**
	 * Subscribe to the queue
	 * @param callback The callback to call when a message is enqueued
	 */
	subscribe(callback: (message: T) => Promise<void>): void;
}

export interface IMessageQueueManagerOptions {
	maxQueues?: number;
}

export interface IMessageQueueManager<T> {
	enqueue(queueId: string, message: T): Promise<void>;
	subscribe(queueId: string, callback: (message: T) => Promise<void>): void;
}
