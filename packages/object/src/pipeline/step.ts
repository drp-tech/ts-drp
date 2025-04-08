import { handlePromiseOrValue } from "@ts-drp/utils";

import { type HandlerReturn, type PipelineStep } from "./types.js";

export interface StepOptions<I, O> {
	(request: I): HandlerReturn<O> | Promise<HandlerReturn<O>>;
}

/**
 * A step in the pipeline
 * @template I - The type of the input
 * @template O - The type of the output
 */
export class Step<I, O> implements PipelineStep<I, O> {
	private next: PipelineStep<O, unknown> | null = null;
	private processFunction: StepOptions<I, O>;

	/**
	 * Creates a new pipeline step.
	 * @param handler The function that handles the logic for this step.
	 * It can be sync (return O) or async (return Promise<O>).
	 */
	constructor(handler: StepOptions<I, O>) {
		this.processFunction = handler;
	}

	/**
	 * Set the next handler in the pipeline
	 * @param handler - The next handler in the pipeline
	 */
	_setNextHandler(handler: PipelineStep<O, unknown>): void {
		this.next = handler;
	}

	/**
	 * Execute the step
	 * @param input - The input to execute the step with
	 * @returns The result of the step
	 */
	_execute(input: I): HandlerReturn<O> | Promise<HandlerReturn<O>> {
		const pResult = this.processFunction(input);

		if (this.next) {
			const next = this.next;

			return handlePromiseOrValue(pResult, ({ stop, result }) => {
				if (stop) return { stop, result };

				return next._execute(result);
			}) as HandlerReturn<O> | Promise<HandlerReturn<O>>;
		}
		return pResult;
	}
}
