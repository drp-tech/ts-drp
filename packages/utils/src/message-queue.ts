import { type IMessageQueue, type IMessageQueueOptions, MessageQueueEvent } from "@ts-drp/types";
import { EventEmitter } from "events";

export class MessageQueue<T> extends EventEmitter implements IMessageQueue<T> {
	private queue: T[] = [];
	private head = 0;
	private processing: boolean = false;

	private readonly options: Required<IMessageQueueOptions>;

	constructor(options: IMessageQueueOptions = {}) {
		super();
		this.options = {
			maxSize: options.maxSize ?? 1000,
			dropOnFull: options.dropOnFull ?? false,
		};
	}

	public enqueue(message: T): boolean {
		if (this.queue.length >= this.options.maxSize) {
			if (this.options.dropOnFull) {
				this.emit(MessageQueueEvent.Dropped, message);
				return false;
			}
			this.emit(MessageQueueEvent.Full);
		}

		console.log("Enqueue", this.getLength(), message);
		this.queue.push(message);
		this.emit(MessageQueueEvent.Enqueued, message);

		// If we're processing messages and this is the only message, process it
		if (this.processing && this.getLength() === 1) {
			void this.processNextMessage();
		}

		return true;
	}

	/**
	 * Start processing messages from the queue
	 */
	public start(): void {
		if (this.processing) return;

		this.processing = true;
		if (this.head < this.queue.length) {
			void this.processNextMessage();
		}

		this.emit(MessageQueueEvent.Started);
	}

	/**
	 * Stop processing messages
	 */
	public stop(): void {
		if (!this.processing) return;

		this.processing = false;
		this.emit(MessageQueueEvent.Stopped);
	}

	/**
	 * Get the length of the queue
	 */
	public getLength(): number {
		return this.queue.length - this.head;
	}

	/**
	 * Process the next message in the queue
	 */
	private async processNextMessage(): Promise<void> {
		if (!this.processing || this.head >= this.queue.length) return;

		const message = this.queue[this.head];
		this.head++;

		console.log("Processing next message", this.processing, this.head, this.queue.length, message);
		try {
			await Promise.resolve(this.emit(MessageQueueEvent.Processing, message));
			this.emit(MessageQueueEvent.Processed, message);

			// Only remove messages after successful processing
			if (this.head > this.options.maxSize >> 2) {
				this.queue.splice(0, this.head);
				this.head = 0;
			}

			if (this.head < this.queue.length) {
				void this.processNextMessage();
			}
		} catch (error) {
			this.emit(MessageQueueEvent.Error, { message, error });

			if (this.head < this.queue.length) {
				void this.processNextMessage();
			}
		}
	}

	public clear(): void {
		this.queue = [];
		this.head = 0;
		this.emit(MessageQueueEvent.Cleared);
	}
}
