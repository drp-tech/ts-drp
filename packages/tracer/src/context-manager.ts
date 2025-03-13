import { context } from "@opentelemetry/api";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";

export const initContextManager = (): void => {
	const contextManager = new AsyncHooksContextManager();
	contextManager.enable();
	context.setGlobalContextManager(contextManager);
	return;
};
