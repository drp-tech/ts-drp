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
