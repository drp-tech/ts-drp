import { type IDRP, SemanticsType } from "@ts-drp/types";
import {
	type BoardShape,
	type Block,
	type BlockShape,
	SHAPES,
	EmptyCell,
} from "../types";
import {
	getEmptyBoard,
	getRandomBlock,
	hasCollisions,
} from "../hooks/useTetrisBoard";
import { addShapeToBoard } from "../hooks/useTetris";

type DRPBoard = {
	board: BoardShape;
	droppingRow: Map<string, number>;
	droppingColumn: Map<string, number>;
	droppingBlock: Map<string, Block>;
	droppingShape: Map<string, BlockShape>;
};

export class Tetris implements IDRP {
	boards: DRPBoard;
	semanticsType: SemanticsType = SemanticsType.pair;

	constructor() {
		this.boards = {
			board: getEmptyBoard(),
			droppingRow: new Map(),
			droppingColumn: new Map(),
			droppingBlock: new Map(),
			droppingShape: new Map(),
		};
	}

	startGame(player: string) {
		console.log("startGame", player);

		const firstBlock = getRandomBlock();
		this.boards.droppingRow.set(player, 0);
		this.boards.droppingColumn.set(player, 3);
		this.boards.droppingBlock.set(player, firstBlock);
		this.boards.droppingShape.set(player, SHAPES[firstBlock].shape);
		// this.computeBoard();
	}

	drop(player: string) {
		if (this.hasCollisions(player)) {
			return;
		}

		this.boards.droppingRow.set(
			player,
			(this.boards.droppingRow.get(player) ?? 0) + 1,
		);
	}

	hasCollisions(player: string) {
		return hasCollisions(
			this.boards.board,
			this.boards.droppingShape.get(player) ?? [],
			this.boards.droppingRow.get(player) ?? 0,
			this.boards.droppingColumn.get(player) ?? 0,
		);
	}

	getNewBlock(player: string) {
		const newBlock = getRandomBlock();
		this.boards.droppingRow.set(player, 0);
		this.boards.droppingColumn.set(player, 3);
		this.boards.droppingBlock.set(player, newBlock);
		this.boards.droppingShape.set(player, SHAPES[newBlock].shape);
	}

	computeBoard() {
		for (const player of this.boards.droppingRow.keys()) {
			addShapeToBoard(
				this.boards.board,
				this.boards.droppingBlock.get(player),
				this.boards.droppingShape.get(player),
				this.boards.droppingRow.get(player),
				this.boards.droppingColumn.get(player),
			);
		}
	}
}
