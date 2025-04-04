import { ActionType, type IDRP, type ResolveConflictsType, SemanticsType, type Vertex } from "@ts-drp/types";

/**
 * The Grid DRP object
 */
export class Grid implements IDRP {
	semanticsType: SemanticsType = SemanticsType.pair;
	positions: Map<string, { x: number; y: number }>;

	/**
	 * Constructor
	 */
	constructor() {
		this.positions = new Map<string, { x: number; y: number }>();
	}

	/**
	 * Add a user to the grid
	 * @param userId - The user id
	 * @param color - The color of the user
	 */
	addUser(userId: string, color: string): void {
		const userColorString = `${userId}:${color}`;
		this.positions.set(userColorString, { x: 0, y: 0 });
	}

	/**
	 * Move a user in the grid
	 * @param userId - The user id
	 * @param direction - The direction to move the user
	 */
	moveUser(userId: string, direction: string): void {
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

	/**
	 * Query the users in the grid
	 * @returns The users in the grid
	 */
	query_users(): string[] {
		return [...this.positions.keys()];
	}

	/**
	 * Query the position of a user
	 * @param userColorString - The user color string
	 * @returns The position of the user
	 */
	query_userPosition(userColorString: string): { x: number; y: number } | undefined {
		const position = this.positions.get(userColorString);
		if (position) {
			return position;
		}
		return undefined;
	}

	/**
	 * Resolve conflicts
	 * @param _ - The vertices
	 * @returns The resolve conflicts type
	 */
	resolveConflicts(_: Vertex[]): ResolveConflictsType {
		return { action: ActionType.Nop };
	}
}

/**
 * Create a new Grid
 * @returns The new Grid
 */
export function createGrid(): Grid {
	return new Grid();
}
