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

/**
 * A custom error class for invalid hash errors
 */
export class InvalidHashError extends Error {
	/**
	 * @param message - The message of the error
	 */
	constructor(message: string = "Invalid hash") {
		super(message);
		this.name = "InvalidHashError";
	}
}

/**
 * A custom error class for invalid dependencies errors
 */
export class InvalidDependenciesError extends Error {
	/**
	 * @param message - The message of the error
	 */
	constructor(message: string = "Invalid dependencies") {
		super(message);
		this.name = "InvalidDependenciesError";
	}
}

/**
 * A custom error class for invalid timestamp errors
 */
export class InvalidTimestampError extends Error {
	/**
	 * @param message - The message of the error
	 */
	constructor(message: string = "Invalid timestamp") {
		super(message);
		this.name = "InvalidTimestampError";
	}
}
