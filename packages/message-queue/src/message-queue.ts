import type { IMessageQueue, IMessageQueueOptions } from "@ts-drp/types";

import { Channel } from "./channel.js";

export class MessageQueue<T> implements IMessageQueue<T> {
	private readonly options: Required<IMessageQueueOptions>;
	private queue: Channel<T>;
	private isActive: boolean = true;

	constructor(options: IMessageQueueOptions = {}) {
		this.options = {
			maxSize: options.maxSize ?? 1000,
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

	subscribe(handler: (message: T) => Promise<void>): void {
		const startProcessingMessages = async (): Promise<void> => {
			while (this.isActive) {
				try {
					const message = await this.queue.receive();
					await handler(message);
					console.log(`queue::processed message ${message}`);
				} catch (error) {
					if (error instanceof Error && error.message === "Channel is closed") {
						break;
					}
					throw new Error(`Error in subscription: ${error}`);
				}
			}
		};

		void startProcessingMessages();
	}

	close(): void {
		if (!this.isActive) {
			throw new Error("Message queue is already closed");
		}
		this.isActive = false;
		// Close the channel to unblock any waiting receives
		this.queue.close();
	}
}
