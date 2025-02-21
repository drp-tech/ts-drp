import {
	ActionType,
	type DRP,
	type ResolveConflictsType,
	SemanticsType,
	type Vertex,
} from "@ts-drp/object";

export class Grid implements DRP {
	semanticsType: SemanticsType = SemanticsType.pair;
	positions: Map<string, { x: number; y: number }>;

	constructor() {
		this.positions = new Map<string, { x: number; y: number }>();
	}

	addUser(userId: string, color: string): void {
		const userColorString = `${userId}:${color}`;
		this.positions.set(userColorString, { x: 0, y: 0 });
	}

	moveUser(userId: string, direction: string): void {
		this._moveUser(userId, direction);
	}

	private _moveUser(userId: string, direction: string): void {
		const userColorString = [...this.positions.keys()].find((u) => u.startsWith(`${userId}:`));
		if (userColorString) {
			const position = this.positions.get(userColorString);
			if (position) {
				switch (direction) {
					case "U":
						position.y += 1;
						break;
					case "D":
						position.y -= 1;
						break;
					case "L":
						position.x -= 1;
						break;
					case "R":
						position.x += 1;
						break;
				}
			}
		}
	}

	query_users(): string[] {
		return [...this.positions.keys()];
	}

	query_userPosition(userColorString: string): { x: number; y: number } | undefined {
		const position = this.positions.get(userColorString);
		if (position) {
			return position;
		}
		return undefined;
	}

	resolveConflicts(_: Vertex[]): ResolveConflictsType {
		return { action: ActionType.Nop };
	}
}

export function createGrid(): Grid {
	return new Grid();
}
