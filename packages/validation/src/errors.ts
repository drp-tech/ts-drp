import { type ZodError } from "zod";

/**
 * A custom error class for DRP validation errors
 */
export class DRPValidationError extends Error {
	zodError: ZodError;

	/**
	 * @param zodError - The zod error
	 */
	constructor(zodError: ZodError) {
		super(zodError.message);
		this.zodError = zodError;
		this.name = "DRPValidationError";
	}
}

export class InvalidHashError extends Error {
	constructor(message: string = "Invalid hash") {
		super(message);
		this.name = "InvalidHashError";
	}
}

export class InvalidDependenciesError extends Error {
	constructor(message: string = "Invalid dependencies") {
		super(message);
		this.name = "InvalidDependenciesError";
	}
}

export class InvalidTimestampError extends Error {
	constructor(message: string = "Invalid timestamp") {
		super(message);
		this.name = "InvalidTimestampError";
	}
}
