import { ActionType, type IDRP, type ResolveConflictsType, SemanticsType } from "@ts-drp/types";

export class Chat implements IDRP {
	semanticsType: SemanticsType = SemanticsType.pair;
	// store messages as strings in the format (timestamp, message, peerId)
	messages: Set<string>;
	constructor() {
		this.messages = new Set<string>();
	}

	addMessage(timestamp: string, message: string, peerId: string): void {
		this.messages.add(`(${timestamp}, ${message}, ${peerId})`);
	}

	query_messages(): Set<string> {
		return this.messages;
	}

	resolveConflicts(): ResolveConflictsType {
		return { action: ActionType.Nop };
	}
}
