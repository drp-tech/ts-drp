import { type LoggerOptions } from "@ts-drp/types";
import loglevel from "loglevel";
import prefix from "loglevel-plugin-prefix";

export interface ILogger {
	trace(...args: unknown[]): void;
	debug(...args: unknown[]): void;
	info(...args: unknown[]): void;
	warn(...args: unknown[]): void;
	error(...args: unknown[]): void;
}

/**
 * Logger is a class that provides a logger for the application.
 * It provides methods to log messages at different levels.
 */
export class Logger {
	private log: loglevel.Logger;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;

	/**
	 * Constructor for Logger
	 * @param context - The context of the logger
	 * @param config - The configuration for the logger
	 */
	constructor(context: string, config?: LoggerOptions) {
		this.log = loglevel.getLogger(context);
		this.log.setLevel(config?.level || "info");
		prefix.reg(loglevel);
		prefix.apply(this.log, {
			template: config?.template ?? "%n",
		});

		for (const method of Object.keys(this.log)) {
			const logMethod = this.log[method as keyof loglevel.Logger];
			if (typeof logMethod === "function") {
				this[method as string] = logMethod.bind(this.log);
			}
		}
	}
}
