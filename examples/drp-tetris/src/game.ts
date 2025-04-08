import { BOARD_WIDTH, BOARD_HEIGHT } from "./hooks/useTetrisBoard";
import {
	type BoardShape,
	EmptyCell,
	type GameState,
	SHAPES,
	type Block,
	type BlockShape,
} from "./types";

export function getEmptyBoard(): BoardShape {
	return Array.from({ length: BOARD_HEIGHT }, () =>
		Array.from({ length: BOARD_WIDTH }, () => EmptyCell.Empty),
	);
}

export function getRandomBlock(): Block {
	return Object.keys(SHAPES)[
		Math.floor(Math.random() * Object.keys(SHAPES).length)
	] as Block;
}
