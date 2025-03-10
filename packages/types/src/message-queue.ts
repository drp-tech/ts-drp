/**
 * Options for the message queue.
 */
export interface IMessageQueueOptions {
	maxSize?: number; // Maximum number of messages in the queue
	dropOnFull?: boolean; // Whether to drop new messages when queue is full
}

/**
 * Events for the message queue.
 */
export enum MessageQueueEvent {
	Enqueued = "message:enqueued",
	Processing = "message:processing",
	Processed = "message:processed",
	Error = "message:error",
	Dropped = "message:dropped",
	Cleared = "queue:cleared",
	Started = "queue:started",
	Stopped = "queue:stopped",
	Full = "queue:full",
}

/**
 * A message queue.
 */
export interface IMessageQueue<T> {
	/**
	 * Enqueue a new message and process it if queue is active
	 * @param message The message to enqueue
	 * @returns boolean indicating if the message was successfully enqueued
	 */
	enqueue(message: T): boolean;
	/**
	 * Start processing messages from the queue
	 */
	start(): void;
	/**
	 * Stop processing messages
	 */
	stop(): void;
	/**
	 * Clear the queue
	 */
	clear(): void;
}
