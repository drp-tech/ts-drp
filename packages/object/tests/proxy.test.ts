import { describe, test } from "vitest";

describe("DRPProxy", () => {
	test("Test: Proxy", () => {});
});
//	interface TestObject {
//		method(arg: string): string;
//		query_method(arg: string): string;
//		property: string;
//		failingMethod(): never;
//		recursiveMethod(): string;
//	}

//	interface NestedTestObject {
//		methodA(): string;
//		methodB(): string;
//	}

//	interface QueryTestObject {
//		query_method(): string;
//	}

//	let target: TestObject;
//	let proxy: DRPProxy<TestObject>;

//	beforeEach((): void => {
//		target = {
//			method: (arg: string): string => `original ${arg}`,
//			query_method: (arg: string): string => `query ${arg}`,
//			property: "value",
//			failingMethod: (): never => {
//				throw new Error("Test error");
//			},
//			recursiveMethod: function (this: TestObject): string {
//				return this.recursiveMethod();
//			},
//		};
//		proxy = new DRPProxy(target);
//	});

//	it("should proxy method calls correctly", (): void => {
//		const result = proxy.proxy.method("test");
//		expect(result).toBe("original test");
//	});

//	it("should not wrap query methods", (): void => {
//		const result = proxy.proxy.query_method("test");
//		expect(result).toBe("query test");
//	});

//	it("should pass through non-function properties", (): void => {
//		expect(proxy.proxy.property).toBe("value");
//	});

//	it("should execute before callbacks", (): void => {
//		const beforeCallback = vi.fn();
//		proxy.registerBeforeCall(beforeCallback);

//		proxy.proxy.method("test");

//		expect(beforeCallback).toHaveBeenCalledTimes(1);
//		expect(beforeCallback).toHaveBeenCalledWith(target, "test");
//	});

//	//it("should execute after callbacks", (): void => {
//	//	const afterCallback = vi.fn();
//	//	proxy.registerAfterCall(afterCallback);

//	//	proxy.proxy.method("test");

//	//	expect(afterCallback).toHaveBeenCalledTimes(1);
//	//	expect(afterCallback).toHaveBeenCalledWith(target, "test", "original test");
//	//});

//	it("should execute multiple callbacks in order", (): void => {
//		const beforeCallback1 = vi.fn();
//		const beforeCallback2 = vi.fn();
//		const afterCallback1 = vi.fn();
//		const afterCallback2 = vi.fn();

//		proxy.registerBeforeCall(beforeCallback1);
//		proxy.registerBeforeCall(beforeCallback2);
//		proxy.registerAfterCall(afterCallback1);
//		proxy.registerAfterCall(afterCallback2);

//		proxy.proxy.method("test");

//		expect(beforeCallback1).toHaveBeenCalledBefore(beforeCallback2);
//		expect(afterCallback1).toHaveBeenCalledBefore(afterCallback2);
//	});

//	it("should maintain the correct this context in method calls", (): void => {
//		const contextTest = {
//			value: "context",
//			method: function (this: { value: string }): string {
//				return this.value;
//			},
//		};
//		const contextProxy = new DRPProxy(contextTest);

//		const result = contextProxy.proxy.method();
//		expect(result).toBe("context");
//	});

//	it("should properly propagate errors from the target method", (): void => {
//		expect(() => proxy.proxy.failingMethod()).toThrow("Test error");
//	});

//	it("should execute callbacks even when the target method throws an error", (): void => {
//		const beforeCallback = vi.fn();
//		const afterCallback = vi.fn();

//		proxy.registerBeforeCall(beforeCallback);
//		proxy.registerAfterCall(afterCallback);

//		expect(() => proxy.proxy.failingMethod()).toThrow("Test error");

//		expect(beforeCallback).toHaveBeenCalledTimes(1);
//		expect(afterCallback).toHaveBeenCalledTimes(0);
//	});

//	it("should execute callbacks in correct order even when error occurs", (): void => {
//		const beforeCallback1 = vi.fn();
//		const beforeCallback2 = vi.fn();

//		proxy.registerBeforeCall(beforeCallback1);
//		proxy.registerBeforeCall(beforeCallback2);

//		expect(() => proxy.proxy.failingMethod()).toThrow("Test error");

//		expect(beforeCallback1).toHaveBeenCalledBefore(beforeCallback2);
//	});

//	it("should handle recursive method calls without infinite recursion", (): void => {
//		const beforeCallback = vi.fn();
//		const afterCallback = vi.fn();

//		proxy.registerBeforeCall(beforeCallback);
//		proxy.registerAfterCall(afterCallback);

//		expect(() => proxy.proxy.recursiveMethod()).toThrow("Maximum call stack size exceeded");

//		expect(beforeCallback).toHaveBeenCalledTimes(1);
//		expect(afterCallback).toHaveBeenCalledTimes(0);
//	});

//	//it("should handle nested recursive calls correctly", (): void => {
//	//	const beforeCallback = vi.fn();
//	//	const afterCallback = vi.fn();

//	//	proxy.registerBeforeCall(beforeCallback);
//	//	proxy.registerAfterCall(afterCallback);

//	//	const nestedTarget: NestedTestObject = {
//	//		methodA: function (this: NestedTestObject): string {
//	//			console.log("methodA", this);
//	//			return this.methodB();
//	//		},
//	//		methodB: function (this: NestedTestObject): string {
//	//			console.log("methodB", this);
//	//			return this.methodA();
//	//		},
//	//	};
//	//	const nestedProxy = new DRPProxy(nestedTarget);
//	//	nestedProxy.registerBeforeCall(beforeCallback);
//	//	nestedProxy.registerAfterCall(afterCallback);

//	//	expect(() => nestedProxy.proxy.methodA()).toThrow("Maximum call stack size exceeded");

//	//	expect(beforeCallback).toHaveBeenCalledTimes(2);
//	//	expect(afterCallback).toHaveBeenCalledTimes(0);
//	//});

//	it("should handle recursive calls with query methods", (): void => {
//		const beforeCallback = vi.fn();
//		const afterCallback = vi.fn();

//		proxy.registerBeforeCall(beforeCallback);
//		proxy.registerAfterCall(afterCallback);

//		const queryTarget: QueryTestObject = {
//			query_method: function (this: QueryTestObject): string {
//				return this.query_method();
//			},
//		};
//		const queryProxy = new DRPProxy(queryTarget);

//		expect(() => queryProxy.proxy.query_method()).toThrow("Maximum call stack size exceeded");

//		expect(beforeCallback).toHaveBeenCalledTimes(0);
//		expect(afterCallback).toHaveBeenCalledTimes(0);
//	});
//});
