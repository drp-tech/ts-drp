import {
	ActionType,
	BaseDRP,
	type Operation,
	type ResolveConflictsType,
	SemanticsType,
	type Vertex,
} from "@ts-drp/object";

export class Chat extends BaseDRP {
	operations: string[] = ["addMessage"];
	semanticsType: SemanticsType = SemanticsType.pair;
	// store messages as strings in the format (timestamp, message, nodeId)
	messages: Set<string>;
	constructor() {
		super();
		this.messages = new Set<string>();
	}

	addMessage(timestamp: string, message: string, nodeId: string): void {
		this._addMessage(timestamp, message, nodeId);
	}

	private _addMessage(
		timestamp: string,
		message: string,
		nodeId: string,
	): void {
		this.messages.add(`(${timestamp}, ${message}, ${nodeId})`);
	}

	getMessages(): Set<string> {
		return this.messages;
	}

	resolveConflicts(vertices: Vertex[]): ResolveConflictsType {
		return { action: ActionType.Nop };
	}
}
