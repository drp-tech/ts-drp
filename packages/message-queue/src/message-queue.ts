import type { IMessageQueue, IMessageQueueOptions } from "@ts-drp/types";

import { Channel } from "./channel.js";

export class MessageQueue<T> implements IMessageQueue<T> {
	private readonly options: Required<IMessageQueueOptions>;
	private queue: Channel<T>;
	private isActive: boolean = true;

	constructor(options: IMessageQueueOptions = {}) {
		this.options = {
			maxSize: options.maxSize ?? 1000,
			dropOnFull: options.dropOnFull ?? false,
		};
		this.queue = new Channel<T>({ capacity: this.options.maxSize });
	}

	async enqueue(message: T): Promise<void> {
		if (!this.isActive) {
			throw new Error("Message queue is closed");
		}
		await this.queue.send(message);
		console.log("enqueued message", message);
	}

	async subscribe(handler: (message: T) => Promise<void>): Promise<void> {
		while (this.isActive) {
			const message = await this.queue.receive();
			await handler(message);
		}
	}

	async close(): Promise<void> {
		this.isActive = false;
		// Allow any in-progress message processing to complete
		await Promise.resolve();
	}
}
