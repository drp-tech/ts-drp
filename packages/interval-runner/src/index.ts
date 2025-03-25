import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { Logger } from "@ts-drp/logger";
import {
	type AnyBooleanCallback,
	type IIntervalRunner,
	type IntervalRunnerOptions,
	IntervalRunnerState,
} from "@ts-drp/types";
import { isAsyncGenerator, isGenerator, isPromise } from "@ts-drp/utils";

export class IntervalRunner<Args extends unknown[] = []> implements IIntervalRunner<"interval:runner", Args> {
	readonly type = "interval:runner";
	readonly interval: number;
	readonly fn: AnyBooleanCallback<Args>;
	readonly id: string;
	readonly throwOnStop: boolean;

	private _intervalId: NodeJS.Timeout | null = null;
	private _state: 0 | 1;
	private _logger: Logger;

	/**
	 * @param interval - The interval in milliseconds
	 * @param fn - The function to run when the interval is up and returns a boolean, true if the interval should continue, false if it should stop
	 */
	constructor(config: IntervalRunnerOptions) {
		const defaultInterval = 10_000; // 10 seconds

		this._state = 0;
		this.interval = config.interval ?? defaultInterval;
		if (this.interval <= 0) {
			throw new Error("Interval must be greater than 0");
		}

		this.fn = config.fn;
		this.throwOnStop = config.throwOnStop ?? true;
		this._logger = new Logger("drp:interval-runner", config.logConfig);
		this.id =
			config.id ??
			bytesToHex(
				sha256
					.create()
					.update(Math.floor(Math.random() * Number.MAX_VALUE).toString())
					.digest()
			);
	}

	private async execute(args?: Args): Promise<boolean> {
		const result = args ? this.fn(...args) : this.fn();

		if (isAsyncGenerator(result)) {
			let lastValue: boolean = false;
			for await (const value of result) {
				lastValue = value;
			}

			return lastValue;
		}

		if (isGenerator(result)) {
			let lastValue: boolean = false;
			for (const value of result) {
				lastValue = value;
			}

			return lastValue;
		}

		if (isPromise(result)) {
			return result;
		}

		return result;
	}

	/**
	 * Start the interval runner
	 * @param args - The arguments to pass to the function
	 */
	start(args?: Args): void {
		if (this._state === 1) {
			throw new Error("Interval runner is already running");
		}

		this._state = 1;

		const scheduleNext = async (): Promise<void> => {
			if (this._state === 0) {
				this._logger.info("Interval runner was already stopped");
				return;
			}

			try {
				const result = await this.execute(args);
				if (result === false) {
					this._logger.info("Interval runner stopped");
					this.stop();
					return;
				}

				if (this._state === 1) {
					this._intervalId = setTimeout(() => void scheduleNext(), this.interval);
				}
			} catch (error) {
				this._logger.error("Error in interval runner:", error);
				this.stop();
			}
		};

		// Start the first execution
		void scheduleNext();
	}

	/**
	 * Stop the interval runner
	 */
	stop(): void {
		if (this._state === 0) {
			if (this.throwOnStop) {
				throw new Error("Interval runner is not running");
			}
			return;
		}

		this._state = 0;
		if (this._intervalId) {
			clearTimeout(this._intervalId);
			this._intervalId = null;
		}
	}

	get state(): IntervalRunnerState {
		return this._state === 1 ? IntervalRunnerState.Running : IntervalRunnerState.Stopped;
	}
}
