import { isPromise } from "@ts-drp/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Fn<I, O> = (input: I) => [O, boolean] | Promise<[O, boolean]>;

export class StopableChain<Input, Output = Input> {
	private chain: Fn<any, any>[] = [];

	then<Next>(fn: Fn<Output, Next>): StopableChain<Input, Next> {
		this.chain.push(fn);
		return this as unknown as StopableChain<Input, Next>;
	}

	execute(initial: Input): Output | Promise<Output> {
		return this.processChainSequentially(initial, 0) as Output | Promise<Output>;
	}

	private processChainSequentially(input: any, index: number): any | Promise<any> {
		let result = input;
		for (let i = index; i < this.chain.length; i++) {
			const outcome = this.chain[i](result);

			if (isPromise(outcome)) {
				return outcome.then(([newResult, continueChain]) => {
					if (!continueChain) {
						return newResult;
					}
					return this.processChainSequentially(newResult, i + 1);
				});
			}
			const [newResult, continueChain] = outcome;
			if (!continueChain) {
				return newResult;
			}
			result = newResult;
		}
		return result;
	}
}
