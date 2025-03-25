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

	//// need to find something better to know if we were stopped
	//execute(initial: Input): Output | Promise<Output> {
	//	let result = initial;
	//	//let continue  = true;
	//	return processSequentially3(this.chain, (fn: Fn<unknown, Output>, previousResult: [Output, boolean]) => {
	//		return true;
	//	});
	//	for (const fn of this.chain) {
	//		const [newResult, continueChain] = fn(result);
	//		if (!continueChain) {
	//			return newResult;
	//		}
	//		result = newResult;
	//	}
	//	return result as unknown as Output;
	//}

	private processChainSequentially(input: any, index: number): any | Promise<any> {
		let result = input;
		for (let i = index; i < this.chain.length; i++) {
			const fn = this.chain[i];
			const outcome = fn(result);
			if (isPromise(outcome)) {
				// If a promise is returned, chain the remaining steps asynchronously.
				return outcome.then(([newResult, continueChain]) => {
					if (!continueChain) {
						return newResult;
					}
					return this.processChainSequentially(newResult, i + 1);
				});
			} else {
				const [newResult, continueChain] = outcome;
				if (!continueChain) {
					return newResult;
				}
				result = newResult;
			}
		}
		return result;
	}
}
