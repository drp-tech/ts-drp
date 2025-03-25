/* eslint-disable @typescript-eslint/no-explicit-any */

import { handlePromiseOrValue } from "@ts-drp/utils/dist/src/index.js";

import { type HandlerReturn, type PipelineStep } from "./types.js";

export interface StepOptions<I, O> {
	(request: I): HandlerReturn<O> | Promise<HandlerReturn<O>>;
}

export class Step<I, O> implements PipelineStep<I, O> {
	private next: PipelineStep<O, any> | null = null;
	private processFunction: StepOptions<I, O>;

	/**
	 * Creates a new pipeline step.
	 * @param {StepOptions<I, O>} handler The function that handles the logic for this step.
	 * It can be sync (return O) or async (return Promise<O>).
	 */
	constructor(handler: StepOptions<I, O>) {
		this.processFunction = handler;
	}

	_setNextHandler(handler: PipelineStep<O, any>): void {
		this.next = handler;
	}

	_execute(request: I): HandlerReturn<O> | Promise<HandlerReturn<O>> {
		const pResult = this.processFunction(request);

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
