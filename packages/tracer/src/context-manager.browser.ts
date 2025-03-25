import { context } from "@opentelemetry/api";
import { ZoneContextManager } from "@opentelemetry/context-zone";

export const initContextManager = (): void => {
	const contextManager = new ZoneContextManager();
	contextManager.enable();
	context.setGlobalContextManager(contextManager);
};
