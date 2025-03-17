import { Deferred } from "./deferred.js";

export interface ChannelOptions {
	capacity?: number;
}

export class Channel<T> {
	private readonly values: Array<T> = [];
	private readonly sends: Array<{ value: T; signal: Deferred<void> }> = [];
	private readonly options: Required<ChannelOptions>;
	private receives: Array<Deferred<T>> = [];

	constructor(options: ChannelOptions = {}) {
		this.options = {
			capacity: options.capacity ?? 1000,
		};
	}

	async send(value: T): Promise<void> {
		if (value === undefined) {
			throw new Error("Unexpected undefined value in channel");
		}

		// if there are pending receives, deliver immediately
		if (this.receives.length > 0) {
			const recv = this.receives.shift();
			if (recv) {
				recv.resolve(value);
			}
			console.log("delivered to receiver");
			return;
		}

		// if there is space in the buffer, add the value
		if (this.values.length < this.options.capacity) {
			this.values.push(value);
			console.log("delivered to buffer");
			return;
		}

		// if there is no space in the buffer, wait for a receive
		const signal = new Deferred<void>();
		this.sends.push({ value, signal });
		await signal.promise;
	}

	async receive(): Promise<T> {
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
				await send.signal.promise;
				return value;
			}
		}

		// if there are no values or pending sends, wait for a send
		const signal = new Deferred<T>();
		this.receives.push(signal);
		return signal.promise;
	}
}
