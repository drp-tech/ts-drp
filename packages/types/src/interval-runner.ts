import { LoggerOptions } from "./logger.js";

type AnyFnCallback<T, Args extends unknown[] = []> =
	| (() => T)
	| ((...args: Args) => T)
	| (() => Promise<T>)
	| ((...args: Args) => Promise<T>)
	| (() => Generator<T, void, unknown>)
	| ((...args: Args) => Generator<T, void, unknown>)
	| (() => AsyncGenerator<T, void, unknown>)
	| ((...args: Args) => AsyncGenerator<T, void, unknown>);

export type AnyBooleanCallback<Args extends unknown[] = []> = AnyFnCallback<boolean, Args>;

export interface IntervalRunnerOptions {
	interval: number;
	fn: AnyBooleanCallback;
	logConfig?: LoggerOptions;
	id?: string;
}

export interface IntervalRunner<Args extends unknown[] = []> {
	/**
	 * The interval in milliseconds
	 */
	readonly interval: number;

	/**
	 * The function to run when the interval is up.
	 *
	 * @returns `true` if the interval should continue, `false` if it should stop
	 */
	readonly fn: AnyBooleanCallback<Args>;

	/**
	 * The id of the IntervalRunner
	 */
	readonly id: string;

	/**
	 * The current state of the interval runner
	 */
	state: "running" | "stopped";

	/**
	 * Start the interval runner
	 *
	 * @param args - The arguments to pass to the function
	 */
	start(args?: Args): void;

	/**
	 * Stop the interval runner
	 */
	stop(): void;
}
