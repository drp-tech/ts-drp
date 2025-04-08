import { Block, EmptyCell } from "../types";
import type { BlockShape, BoardShape } from "../types";
import { Tetris } from "../drp/Tetris";
import type { IDRPObject } from "@ts-drp/types";
import type { DRPNode } from "@ts-drp/node";
import { addShapeToBoard } from "./useTetris";

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 15;

export function getEmptyBoard(height = BOARD_HEIGHT): BoardShape {
	return Array(height)
		.fill(null)
		.map(() => Array(BOARD_WIDTH).fill(EmptyCell.Empty));
}

export function hasCollisions(
	board: BoardShape,
	currentShape: BlockShape,
	row: number,
	column: number,
): boolean {
	let hasCollision = false;
	currentShape
		.filter((shapeRow) => shapeRow.some((isSet) => isSet))
		.forEach((shapeRow: boolean[], rowIndex: number) => {
			shapeRow.forEach((isSet: boolean, colIndex: number) => {
				if (
					row + rowIndex < currentShape.length ||
					column + colIndex < currentShape[0].length
				) {
					return;
				}
				if (
					isSet &&
					(row + rowIndex >= board.length ||
						column + colIndex >= board[0].length ||
						column + colIndex < 0 ||
						board[row + rowIndex][column + colIndex] !== EmptyCell.Empty)
				) {
					hasCollision = true;
				}
			});
		});
	return hasCollision;
}

export function getRandomBlock(): Block {
	const blockValues = Object.values(Block);
	return blockValues[Math.floor(Math.random() * blockValues.length)] as Block;
}

function rotateBlock(shape: BlockShape): BlockShape {
	const rows = shape.length;
	const columns = shape[0].length;

	const rotated = Array(rows)
		.fill(null)
		.map(() => Array(columns).fill(false));

	for (let row = 0; row < rows; row++) {
		for (let column = 0; column < columns; column++) {
			rotated[column][rows - 1 - row] = shape[row][column];
		}
	}

	return rotated;
}

type Action = {
	type: "start" | "drop" | "commit" | "move";
	newBoard?: BoardShape;
	newBlock?: Block;
	isPressingLeft?: boolean;
	isPressingRight?: boolean;
	isRotating?: boolean;
};

export function changeState(
	tetris: IDRPObject<Tetris>,
	node: DRPNode,
	action: Action,
) {
	if (!node) return;

	switch (action.type) {
		case "start": {
			tetris.drp?.startGame(node.networkNode.peerId);
			break;
		}
		case "drop": {
			tetris?.drp?.drop(node.networkNode.peerId);
			break;
		}
		case "commit": {
			if (tetris?.drp && action.newBoard) {
				console.log(
					"commit",
					tetris.drp.boards.droppingRow.get(node.networkNode.peerId),
					tetris.drp.boards.droppingColumn.get(node.networkNode.peerId),
				);

				const newBoard = structuredClone(tetris.drp.boards.board);
				addShapeToBoard(
					newBoard,
					tetris.drp.boards.droppingBlock.get(node.networkNode.peerId) ?? "",
					tetris.drp.boards.droppingShape.get(node.networkNode.peerId),
					tetris.drp.boards.droppingRow.get(node.networkNode.peerId),
					tetris.drp.boards.droppingColumn.get(node.networkNode.peerId),
				);
				tetris.drp.boards.board = newBoard;
				tetris.drp.getNewBlock(node.networkNode.peerId);
			}
			break;
		}
		case "move": {
			if (!tetris?.drp?.boards) break;

			const droppingShape = tetris.drp.boards.droppingShape.get(
				node.networkNode.peerId,
			);
			const droppingRow = tetris.drp.boards.droppingRow.get(
				node.networkNode.peerId,
			);
			const droppingColumn = tetris.drp.boards.droppingColumn.get(
				node.networkNode.peerId,
			);

			if (
				!droppingShape ||
				droppingRow === undefined ||
				droppingColumn === undefined
			)
				break;

			const rotatedShape = action.isRotating
				? rotateBlock(droppingShape)
				: droppingShape;

			let columnOffset = action.isPressingLeft ? -1 : 0;
			columnOffset = action.isPressingRight ? 1 : columnOffset;

			if (
				!hasCollisions(
					tetris.drp.boards.board || getEmptyBoard(),
					rotatedShape,
					droppingRow,
					droppingColumn + columnOffset,
				)
			) {
				const newColumn = droppingColumn + columnOffset;
				tetris.drp.boards.droppingColumn.set(
					node.networkNode.peerId,
					newColumn,
				);

				if (action.isRotating) {
					tetris.drp.boards.droppingShape.set(
						node.networkNode.peerId,
						rotatedShape,
					);
				}
			}
			break;
		}
		default: {
			const unhandledType: never = action.type;
			throw new Error(`Unhandled action type: ${unhandledType}`);
		}
	}
}
