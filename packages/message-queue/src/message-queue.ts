import type { IMessageQueue, IMessageQueueOptions } from "@ts-drp/types";

import { Channel } from "./channel.js";

export class MessageQueue<T> implements IMessageQueue<T> {
	private readonly options: Required<IMessageQueueOptions>;
	private queue: Channel<T>;

	constructor(options: IMessageQueueOptions = {}) {
		this.options = {
			maxSize: options.maxSize ?? 1000,
			dropOnFull: options.dropOnFull ?? false,
		};
		this.queue = new Channel<T>(this.options.maxSize);
	}

	async enqueue(message: T): Promise<void> {
		await this.queue.send(message);
		console.log("enqueued message", message);
	}

	async subscribe(callback: (message: T) => Promise<void>): Promise<void> {
		while (true) {
			const message = await this.queue.receive();
			await callback(message);
			console.log("processed message", message);
		}
	}
}
