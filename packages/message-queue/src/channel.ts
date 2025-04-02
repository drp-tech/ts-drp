import { Logger } from "@ts-drp/logger";
import { type LoggerOptions } from "@ts-drp/types";
import { Deferred } from "@ts-drp/utils/promise/deferred";
export interface ChannelOptions {
	capacity?: number;
	logOptions?: LoggerOptions;
}

/**
 * Channel is a class that implements a simple message queue.
 * It provides methods to send and receive messages.
 * @template T - The type of messages that the channel will handle
 */
export class Channel<T> {
	private readonly values: Array<T> = [];
	private readonly sends: Array<{ value: T; signal: Deferred<void> }> = [];
	private readonly receives: Array<Deferred<T>> = [];
	private readonly options: Required<ChannelOptions>;
	private readonly logger: Logger;
	private isClosed: boolean = false;

	/**
	 * Constructor for Channel
	 * @param options - The options for the channel
	 */
	constructor(options: ChannelOptions = {}) {
		this.options = {
			capacity: options.capacity ?? 1000,
			logOptions: options.logOptions ?? {
				level: "info",
			},
		};
		this.logger = new Logger("drp::channel", this.options.logOptions);
	}

	/**
	 * Send a message to the channel
	 * @param value - The value to send to the channel
	 */
	async send(value: T): Promise<void> {
		if (this.isClosed) {
			throw new Error("Channel is closed");
		}

		if (value === undefined) {
			throw new Error("Unexpected undefined value in channel");
		}

		// if there are pending receives, deliver immediately
		if (this.receives.length > 0) {
			const recv = this.receives.shift();
			if (recv) {
				recv.resolve(value);
			}
			return;
		}

		// if there is space in the buffer, add the value
		if (this.values.length < this.options.capacity) {
			this.values.push(value);
			return;
		}

		// if there is no space in the buffer, wait for a receive
		const signal = new Deferred<void>();
		this.sends.push({ value, signal });
		await signal.promise;
	}

	/**
	 * Receive a message from the channel
	 * @returns The value received from the channel
	 */
	async receive(): Promise<T> {
		// if channel is closed and no more messages, throw
		if (this.isClosed && this.values.length === 0 && this.sends.length === 0) {
			throw new Error("Channel is closed");
		}

		// if there are values in the buffer, return the first one
		if (this.values.length > 0) {
			const value = this.values.shift();
			if (value === undefined) {
				throw new Error("Unexpected undefined value in channel");
			}
			return value;
		}

		// if there are pending sends, accept the first one
		if (this.sends.length > 0) {
			const send = this.sends.shift();
			if (send) {
				const value = send.value;
				send.signal.resolve();
				return value;
			}
		}

		// if channel is closed and we got here, it means no more messages
		if (this.isClosed) {
			throw new Error("Channel is closed");
		}

		// if there are no values or pending sends, wait for a send
		const signal = new Deferred<T>();
		this.receives.push(signal);
		return signal.promise;
	}

	/**
	 * Close the channel
	 */
	close(): void {
		this.isClosed = true;
		// Reject all pending receives
		while (this.receives.length > 0) {
			const recv = this.receives.shift();
			if (recv) {
				recv.reject(new Error("Channel is closed"));
			}
		}
	}

	/**
	 * Start the channel
	 */
	start(): void {
		if (this.isClosed) {
			this.logger.warn("Channel is closed");
			return;
		}
		this.isClosed = true;
	}
}
