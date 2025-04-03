import { ActionType, type IDRP, type ResolveConflictsType, SemanticsType } from "@ts-drp/types";

/**
 * The Chat DRP object
 */
export class Chat implements IDRP {
	semanticsType: SemanticsType = SemanticsType.pair;
	// store messages as strings in the format (timestamp, message, peerId)
	messages: Set<string>;
	/**
	 * Constructor
	 */
	constructor() {
		this.messages = new Set<string>();
	}

	/**
	 * Add a message to the chat
	 * @param timestamp - The timestamp of the message
	 * @param message - The message
	 * @param peerId - The peer id
	 */
	addMessage(timestamp: string, message: string, peerId: string): void {
		this.messages.add(`(${timestamp}, ${message}, ${peerId})`);
	}

	/**
	 * Query the messages in the chat
	 * @returns The messages in the chat
	 */
	query_messages(): Set<string> {
		return this.messages;
	}

	/**
	 * Resolve conflicts
	 * @returns The resolve conflicts type
	 */
	resolveConflicts(): ResolveConflictsType {
		return { action: ActionType.Nop };
	}
}
