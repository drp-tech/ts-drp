import { type ILogger } from "@ts-drp/logger";

// TODO: replace with the actual logger in each place that need a logger this is just a hack by the mean time to fix the circular dependency
export const log: ILogger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
};
