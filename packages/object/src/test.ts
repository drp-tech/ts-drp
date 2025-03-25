import { handlePromiseOrValue } from "@ts-drp/utils/dist/src/index.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface PipelineStep<I, O> {
	_setNextHandler(handler: PipelineStep<O, any>): void;
	// Takes input I, returns Promise<unknown> because the final output type
	// of the whole chain isn't known by an individual step.
	_execute(request: I): unknown | Promise<unknown>;
}

// 2. Base implementation for common handler functionality
// It's now async-aware
class Step<I, O> implements PipelineStep<I, O> {
	private next: PipelineStep<O, any> | null = null;
	private processFunction: (request: I) => O | Promise<O>;

	/**
	 * Creates a new pipeline step.
	 * @param processFunction The function that handles the logic for this step.
	 * It can be sync (return O) or async (return Promise<O>).
	 */
	constructor(processFunction: (request: I) => O | Promise<O>) {
		this.processFunction = processFunction;
	}

	// Internal method for linking used by the Pipeline class
	_setNextHandler(handler: PipelineStep<O, any>): void {
		this.next = handler;
	}

	// _execute is now an async function
	_execute(request: I): unknown | Promise<unknown> {
		// Await the result of this step, in case process is async
		const result = this.processFunction(request);

		if (this.next) {
			const next = this.next;
			return handlePromiseOrValue(result, (pResult) => next._execute(pResult));
		}
		// This is the last step, return its resolved result
		// (implicitly wrapped in Promise by async function)
		return result;
	}
}

class Pipeline<I, O> {
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
	 */
	setNext<NextO>(processFunction: (request: O) => NextO | Promise<NextO>): Pipeline<I, NextO> {
		const nextStep = new Step(processFunction);
		this.lastHandler._setNextHandler(nextStep);
		return new Pipeline<I, NextO>(this.firstHandler, nextStep);
	}

	async handle(request: I): Promise<O> {
		const finalResult = await this.firstHandler._execute(request);
		return finalResult as O;
	}
}

function createPipeline<I, O>(firstProcessFunction: (request: I) => O | Promise<O>): Pipeline<I, O> {
	const firstStep = new Step(firstProcessFunction);
	return new Pipeline(firstStep, firstStep);
}

// --- Client Code ---
// Now uses functions directly with createPipeline and setNext

// Define processing functions (can be inline lambdas or separate functions)

const parseStringToNumberFn = (request: string): number => {
	console.log(`Parser Fn: Processing input "${request}"`);
	if (request.startsWith("PARSE_NUM:")) {
		const numStr = request.substring("PARSE_NUM:".length);
		const num = parseInt(numStr, 10);
		if (isNaN(num)) {
			throw new Error(`Parser Fn: Invalid number format in "${request}"`);
		}
		console.log(`Parser Fn: Outputting number ${num}`);
		return num;
	}
	throw new Error(`Parser Fn: Cannot handle input "${request}"`);
};

const multiplyNumberAsyncFn = async (request: number): Promise<number> => {
	const factor = 10;
	const delayMs = 500;
	console.log(`Multiplier Fn: Processing input number ${request} (will delay ${delayMs}ms)`);
	await setTimeout(delayMs);
	const result = request * factor;
	console.log(`Multiplier Fn: Outputting number ${result}`);
	return result;
};

const formatNumberToStringFn = (request: number): string => {
	console.log(`Formatter Fn: Processing input number ${request}`);
	const result = `The final result is: ${request.toFixed(2)}`;
	console.log(`Formatter Fn: Outputting string "${result}"`);
	return result;
};

// Build the pipeline using the Pipeline class and Step instances
const functionalPipelineSimplified = createPipeline((request: string) => {
	console.log(`Inline Parser: Processing input "${request}"`);
	if (request.startsWith("SIMPLE_PARSE:")) {
		return request.substring("SIMPLE_PARSE:".length);
	}
	throw new Error(`Inline Parser: Cannot handle input "${request}"`);
})
	.setNext((text: string) => {
		console.log(`Length Counter: Processing text "${text}"`);
		return text.length;
	})
	.setNext(async (length: number) => {
		console.log(`Async Incrementer: Processing length ${length}`);
		await setTimeout(200);
		return length + 1;
	})
	.setNext((finalLength: number) => {
		console.log(`Final Formatter: Processing final length ${finalLength}`);
		return `The final length is: ${finalLength}`;
	});

// Run the pipeline (needs an async context)
async function runSimplifiedFunctionalPipeline() {
	console.log("\n--- Starting Simplified Functional Pipeline Execution ---");
	try {
		const initialRequest = "SIMPLE_PARSE:hello";
		console.log(`Client: Sending initial request: "${initialRequest}"`);

		const startTime = Date.now();
		const finalResult: string = await functionalPipelineSimplified.handle(initialRequest);
		const endTime = Date.now();

		console.log(`\nClient: Received final result (type: ${typeof finalResult}): "${finalResult}"`);
		console.log(`Client: Execution time: ${endTime - startTime}ms`);
	} catch (error: any) {
		console.error(`\nClient: Pipeline failed: ${error.message}`);
	}
}

runSimplifiedFunctionalPipeline();

// Example with the original functions
async function runOriginalFunctionsPipeline() {
	console.log("\n--- Starting Pipeline with Original Functions ---");
	try {
		const initialRequest = "PARSE_NUM:123";
		console.log(`Client: Sending initial request: "${initialRequest}"`);

		const startTime = Date.now();
		const finalResult: string = await createPipeline(parseStringToNumberFn)
			.setNext(multiplyNumberAsyncFn)
			.setNext(formatNumberToStringFn)
			.handle(initialRequest);
		const endTime = Date.now();

		console.log(`\nClient: Received final result (type: ${typeof finalResult}): "${finalResult}"`);
		console.log(`Client: Execution time: ${endTime - startTime}ms`);
	} catch (error: any) {
		console.error(`\nClient: Pipeline failed: ${error.message}`);
	}
}
