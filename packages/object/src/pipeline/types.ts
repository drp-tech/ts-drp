/* eslint-disable @typescript-eslint/no-explicit-any */
export interface HandlerReturn<O> {
	stop: boolean;
	result: O;
}

export interface PipelineStep<I, O> {
	_setNextHandler(handler: PipelineStep<O, any>): void;
	_execute(request: I): HandlerReturn<O> | Promise<HandlerReturn<O>>;
}
