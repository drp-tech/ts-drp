import { type LoggerOptions } from "./logger.js";

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
	fn: AnyBooleanCallback;
	interval?: number;
	logConfig?: LoggerOptions;
	id?: string;
}

export interface IIntervalRunner<Type extends string, Args extends unknown[] = []> {
	/**
	 * The type of the interval runner
	 */
	readonly type: Type;

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
