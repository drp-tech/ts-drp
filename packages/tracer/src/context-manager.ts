import { context } from "@opentelemetry/api";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";

/**
 * Initializes and enables the AsyncHooks-based context manager for OpenTelemetry.
 */
export const initContextManager = (): void => {
	const contextManager = new AsyncHooksContextManager();
	contextManager.enable();
	context.setGlobalContextManager(contextManager);
	return;
};
