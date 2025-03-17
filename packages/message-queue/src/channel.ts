import { Deferred } from "./deffered.js";

export interface ChannelOptions {
	capacity?: number;
}

export class Channel<T> {
	private readonly values: Array<T> = [];
	private readonly sends: Array<{ value: T; signal: Deferred<void> }> = [];
	private readonly receives: Array<Deferred<T>> = [];
	private readonly options: Required<ChannelOptions>;

	constructor(options: ChannelOptions = {}) {
		this.options = {
			capacity: options.capacity ?? 1000,
		};
	}

	async send(value: T): Promise<void> {
		if (this.receives.length > 0) {
			const recv = this.receives.shift();
			if (recv) {
				recv.resolve(value);
			}
			return;
		}

		if (this.values.length < this.options.capacity) {
			this.values.push(value);
			return;
		}

		const signal = new Deferred<void>();
		this.sends.push({ value, signal });
		await signal.promise;
	}

	async receive(): Promise<T> {
		if (this.values.length > 0) {
			const value = this.values.shift();
			if (value === undefined) {
				throw new Error("Unexpected undefined value in channel");
			}
			return value;
		}

		if (this.sends.length > 0) {
			const send = this.sends.shift();
			if (send) {
				send.signal.resolve();
				return send.value;
			}
		}

		const signal = new Deferred<T>();
		this.receives.push(signal);
		return signal.promise;
	}
}
