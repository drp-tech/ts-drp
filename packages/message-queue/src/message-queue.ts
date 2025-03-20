import type { IMessageQueue, IMessageQueueOptions } from "@ts-drp/types";

import { Channel } from "./channel.js";

export class MessageQueue<T> implements IMessageQueue<T> {
	private readonly options: Required<IMessageQueueOptions>;
	private channel: Channel<T>;
	private isActive: boolean = true;
	// List of subscriber handlers
	private subscribers: Array<(message: T) => Promise<void>> = [];
	// A flag to ensure the fanout loop starts only once
	private fanoutLoopStarted: boolean = false;

	constructor(options: IMessageQueueOptions = {}) {
		this.options = {
			maxSize: options.maxSize ?? 1000,
		};
		this.channel = new Channel<T>({ capacity: this.options.maxSize });
	}

	async enqueue(message: T): Promise<void> {
		if (!this.isActive) {
			throw new Error("Message queue is closed");
		}
		await this.channel.send(message);
	}

	/**
	 * Register a subscriber's handler.
	 * The handler will be called for every message enqueued.
	 */
	subscribe(handler: (message: T) => Promise<void>): void {
		this.subscribers.push(handler);

		// Start the fanout loop if not already running
		if (!this.fanoutLoopStarted) {
			this.fanoutLoopStarted = true;
			void this.startFanoutLoop();
		}
	}

	/**
	 * A continuous loop that receives messages from the central channel
	 * and fans them out to all registered subscriber handlers.
	 */
	private async startFanoutLoop(): Promise<void> {
		while (this.isActive) {
			try {
				const message = await this.channel.receive();

				for (const handler of this.subscribers) {
					try {
						await handler(message);
						console.log(`queue::processed message ${message}`);
					} catch (error) {
						console.error(`Error in handler processing message ${message}:`, error);
					}
				}
			} catch (error) {
				// When the channel is closed, exit the loop.
				if (error instanceof Error && error.message === "Channel is closed") {
					break;
				} else {
					console.error("Error in fanout loop:", error);
				}
			}
		}
	}

	close(): void {
		if (!this.isActive) {
			throw new Error("Message queue is already closed");
		}
		this.isActive = false;
		this.channel.close();
	}
}
