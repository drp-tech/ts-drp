import { handlePromiseOrValue } from "@ts-drp/utils";

import { Step, type StepOptions } from "./step.js";
import { type PipelineStep } from "./types.js";

/**
 * A pipeline for processing requests
 * @template I - The type of the input
 * @template O - The type of the output
 */
export class Pipeline<I, O> {
	private firstHandler: PipelineStep<I, unknown>;
	private lastHandler: PipelineStep<unknown, O>;

	/**
	 * Create a new pipeline
	 * @param firstHandler - The first handler in the pipeline
	 * @param lastHandler - The last handler in the pipeline
	 */
	constructor(firstHandler: PipelineStep<I, unknown>, lastHandler: PipelineStep<unknown, O>) {
		this.firstHandler = firstHandler;
		this.lastHandler = lastHandler;
	}

	/**
	 * Appends a new processing function to the pipeline.
	 * Takes a function whose input type must match the current pipeline's output type O.
	 * Returns a *new* Pipeline instance representing the extended chain.
	 * @param handler - The function that handles the logic for this step.
	 * It can be sync (return NextO) or async (return Promise<NextO>).
	 * @returns A new pipeline with the new handler
	 */
	setNext<NextO>(handler: StepOptions<O, NextO>): Pipeline<I, NextO> {
		const nextStep = new Step(handler);
		this.lastHandler._setNextHandler(nextStep);
		return new Pipeline<I, NextO>(this.firstHandler, nextStep);
	}

	/**
	 * Execute the pipeline
	 * @param input - The input to execute the pipeline with
	 * @returns The result of the pipeline
	 */
	execute(input: I): O | Promise<O> {
		return handlePromiseOrValue(this.firstHandler._execute(input), (pRequest) => pRequest.result) as O | Promise<O>;
	}
}

/**
 * Create a new pipeline
 * @param fn - The function to create the pipeline from
 * @returns A new pipeline
 */
export function createPipeline<I, O>(fn: StepOptions<I, O>): Pipeline<I, O> {
	const firstStep = new Step(fn);
	return new Pipeline(firstStep, firstStep);
}
