import { Logger } from "@ts-drp/logger";
import type { IMessageQueue, IMessageQueueHandler, IMessageQueueOptions } from "@ts-drp/types";
import { handlePromiseOrValue } from "@ts-drp/utils";

import { Channel } from "./channel.js";

export class MessageQueue<T> implements IMessageQueue<T> {
	private readonly options: Required<IMessageQueueOptions>;
	private channel: Channel<T>;
	private isActive: boolean = true;
	// List of subscriber handlers
	private subscribers: Array<(message: T) => void | Promise<void>> = [];
	// A flag to ensure the fanout loop starts only once
	private fanoutLoopStarted: boolean = false;
	private logger: Logger;

	constructor(options: IMessageQueueOptions = { id: "default" }) {
		this.options = this.getOptions(options);
		this.channel = new Channel<T>({ capacity: this.options.maxSize });
		this.logger = new Logger(`drp::message-queue::${this.options.id}`, this.options.logConfig);
	}

	private getOptions(options: IMessageQueueOptions): Required<IMessageQueueOptions> {
		return {
			id: options.id,
			maxSize: options.maxSize ?? 1000,
			logConfig: options.logConfig ?? {
				level: "info",
			},
		};
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
	subscribe(handler: IMessageQueueHandler<T>): void {
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
						await handlePromiseOrValue(handler, (handler) => handler(message));
						this.logger.trace(`queue::processed message ${message}`);
					} catch (error) {
						this.logger.error(`queue::error processing message ${message}:`, error);
					}
				}
			} catch (error) {
				// When the channel is closed, exit the loop.
				if (error instanceof Error && error.message === "Channel is closed") {
					break;
				} else {
					this.logger.error("Error in fanout loop:", error);
				}
			}
		}
	}

	close(): void {
		if (!this.isActive) {
			this.logger.warn("Message queue is already closed");
			return;
		}
		this.isActive = false;
		this.channel.close();
	}

	start(): void {
		if (this.isActive) {
			this.logger.warn("Message queue is already started");
			return;
		}
		this.isActive = true;
		this.channel.start();
		void this.startFanoutLoop();
	}
}
