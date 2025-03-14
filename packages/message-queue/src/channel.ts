export class Deferred<T> {
	promise: Promise<T>;
	resolve!: (value: T | PromiseLike<T>) => void;
	reject!: (reason?: unknown) => void;

	constructor() {
		this.promise = new Promise((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
}

export class Channel<T> {
	public constructor(
		public readonly capacity = 0,
		private readonly values: Array<T> = [],
		private readonly sends: Array<{ value: T; signal: Deferred<void> }> = [],
		private readonly receives: Array<Deferred<T>> = []
	) {}

	async send(value: T): Promise<void> {
		if (this.receives.length > 0) {
			const recv = this.receives.shift();
			if (recv) {
				recv.resolve(value);
			}
			return;
		}

		if (this.values.length < this.capacity) {
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
