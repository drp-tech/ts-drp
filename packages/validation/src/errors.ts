import { type ZodError } from "zod";

export class DRPValidationError extends Error {
	zodError: ZodError;

	constructor(zodError: ZodError) {
		super(zodError.message);
		this.zodError = zodError;
		this.name = "DRPValidationError";
	}
}
