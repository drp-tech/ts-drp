/* eslint-disable @typescript-eslint/no-explicit-any */
import { handlePromiseOrValue } from "@ts-drp/utils";

import { Step, type StepOptions } from "./step.js";
import { type PipelineStep } from "./types.js";

export class Pipeline<I, O> {
	private firstHandler: PipelineStep<I, any>;
	private lastHandler: PipelineStep<any, O>;

	constructor(firstHandler: PipelineStep<I, any>, lastHandler: PipelineStep<any, O>) {
		this.firstHandler = firstHandler;
		this.lastHandler = lastHandler;
	}

	/**
	 * Appends a new processing function to the pipeline.
	 * Takes a function whose input type must match the current pipeline's output type O.
	 * Returns a *new* Pipeline instance representing the extended chain.
	 *
	 * @param {StepOptions<O, NextO>} handler - The function that handles the logic for this step.
	 * It can be sync (return NextO) or async (return Promise<NextO>).
	 */
	setNext<NextO>(handler: StepOptions<O, NextO>): Pipeline<I, NextO> {
		const nextStep = new Step(handler);
		this.lastHandler._setNextHandler(nextStep);
		return new Pipeline<I, NextO>(this.firstHandler, nextStep);
	}

	handle(request: I): O | Promise<O> {
		return handlePromiseOrValue(this.firstHandler._execute(request), (pRequest) => pRequest.result) as O | Promise<O>;
	}
}

export function createPipeline<I, O>(firstProcessFunction: StepOptions<I, O>): Pipeline<I, O> {
	const firstStep = new Step(firstProcessFunction);
	return new Pipeline(firstStep, firstStep);
}
