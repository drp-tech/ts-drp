import { useCallback, useEffect, useState } from "react";
import type { Block, BlockShape, BoardShape } from "../types";
import { EmptyCell, SHAPES } from "../types";
import { useInterval } from "./useInterval";
import {
	hasCollisions,
	BOARD_HEIGHT,
	getEmptyBoard,
	getRandomBlock,
	changeState,
} from "./useTetrisBoard";
import type { IDRPObject } from "@ts-drp/types";
import type { Tetris } from "../drp/Tetris";
import type { DRPNode } from "@ts-drp/node";
const MAX_HIGH_SCORES = 10;

export function saveHighScore(score: number): void {
	const existingScores = JSON.parse(localStorage.getItem("highScores") || "[]");
	existingScores.push(score);
	const updatedScores = existingScores
		.sort((a: number, b: number) => b - a)
		.slice(0, MAX_HIGH_SCORES);
	localStorage.setItem("highScores", JSON.stringify(updatedScores));
}

export function getHighScores(): number[] {
	try {
		const scores = JSON.parse(localStorage.getItem("highScores") || "[]");
		return Array.isArray(scores)
			? scores.sort((a, b) => b - a).slice(0, MAX_HIGH_SCORES)
			: [];
	} catch {
		return [];
	}
}

enum TickSpeed {
	Normal = 800,
	Sliding = 100,
	Fast = 50,
}

export function useTetris(tetris: IDRPObject<Tetris>, node: DRPNode) {
	const [score, setScore] = useState(0);
	const [upcomingBlocks, setUpcomingBlocks] = useState<Block[]>([]);
	const [isCommitting, setIsCommitting] = useState(false);
	const [isPlaying, setIsPlaying] = useState(false);
	const [tickSpeed, setTickSpeed] = useState<TickSpeed | null>(null);

	const startGame = useCallback(() => {
		setScore(0);
		setIsCommitting(false);
		setIsPlaying(true);
		setTickSpeed(TickSpeed.Normal);
		changeState(tetris, node, { type: "start" });
	}, [tetris, node]);

	const commitPosition = useCallback(() => {
		if (!tetris?.drp?.boards) return;

		const droppingShape = tetris.drp.boards.droppingShape.get(
			node.networkNode.peerId,
		);
		const droppingRow = tetris.drp.boards.droppingRow.get(
			node.networkNode.peerId,
		);
		const droppingColumn = tetris.drp.boards.droppingColumn.get(
			node.networkNode.peerId,
		);
		const droppingBlock = tetris.drp.boards.droppingBlock.get(
			node.networkNode.peerId,
		);

		if (
			!droppingShape ||
			droppingRow === undefined ||
			droppingColumn === undefined ||
			!droppingBlock
		) {
			return;
		}

		if (
			!hasCollisions(
				tetris.drp.boards.board || getEmptyBoard(),
				droppingShape,
				droppingRow + 1,
				droppingColumn,
			)
		) {
			setIsCommitting(false);
			setTickSpeed(TickSpeed.Normal);
			return;
		}

		const newBoard = structuredClone(tetris.drp.boards.board) as BoardShape;
		addShapeToBoard(
			newBoard,
			droppingBlock,
			droppingShape,
			droppingRow,
			droppingColumn,
		);

		let numCleared = 0;
		for (let row = BOARD_HEIGHT - 1; row >= 0; row--) {
			if (newBoard[row].every((entry) => entry !== EmptyCell.Empty)) {
				numCleared++;
				newBoard.splice(row, 1);
			}
		}
		changeState(tetris, node, {
			type: "commit",
			newBoard: [...getEmptyBoard(BOARD_HEIGHT - newBoard.length), ...newBoard],
		});
	}, [tetris, node]);

	const gameTick = useCallback(() => {
		if (!tetris?.drp?.boards) {
			return;
		}

		if (isCommitting) {
			commitPosition();
			setIsCommitting(false);
		} else {
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
			) {
				return;
			}

			if (
				hasCollisions(
					tetris.drp.boards.board || getEmptyBoard(),
					droppingShape,
					droppingRow + 1,
					droppingColumn,
				)
			) {
				setIsCommitting(true);
			} else {
				changeState(tetris, node, { type: "drop" });
			}
		}
	}, [tetris, isCommitting, commitPosition, node]);

	useInterval(() => {
		if (!isPlaying) {
			return;
		}
		gameTick();
	}, tickSpeed);

	useEffect(() => {
		if (!isPlaying) {
			return;
		}

		let isPressingLeft = false;
		let isPressingRight = false;
		let moveIntervalID: ReturnType<typeof setInterval> | undefined;

		const updateMovementInterval = () => {
			clearInterval(moveIntervalID);
			changeState(tetris, node, {
				type: "move",
				isPressingLeft,
				isPressingRight,
			});
			moveIntervalID = setInterval(() => {
				changeState(tetris, node, {
					type: "move",
					isPressingLeft,
					isPressingRight,
				});
			}, 300);
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.repeat) {
				return;
			}

			if (event.key === "ArrowDown") {
				setTickSpeed(TickSpeed.Fast);
			}

			if (event.key === "ArrowUp") {
				changeState(tetris, node, {
					type: "move",
					isRotating: true,
				});
			}

			if (event.key === "ArrowLeft") {
				isPressingLeft = true;
				updateMovementInterval();
			}

			if (event.key === "ArrowRight") {
				isPressingRight = true;
				updateMovementInterval();
			}
		};

		const handleKeyUp = (event: KeyboardEvent) => {
			if (event.key === "ArrowDown") {
				setTickSpeed(TickSpeed.Normal);
			}

			if (event.key === "ArrowLeft") {
				isPressingLeft = false;
				updateMovementInterval();
			}

			if (event.key === "ArrowRight") {
				isPressingRight = false;
				updateMovementInterval();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		document.addEventListener("keyup", handleKeyUp);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.removeEventListener("keyup", handleKeyUp);
			clearInterval(moveIntervalID);
			setTickSpeed(TickSpeed.Normal);
		};
	}, [isPlaying, tetris, node]);

	const renderedBoard = structuredClone(
		tetris?.drp?.boards.board,
	) as BoardShape;

	if (isPlaying && tetris?.drp?.boards) {
		for (const player of tetris.drp.boards.droppingRow.keys()) {
			const droppingBlock = tetris.drp.boards.droppingBlock.get(player);
			const droppingShape = tetris.drp.boards.droppingShape.get(player);
			const droppingRow = tetris.drp.boards.droppingRow.get(player);
			const droppingColumn = tetris.drp.boards.droppingColumn.get(player);

			if (
				droppingBlock &&
				droppingShape &&
				droppingRow !== undefined &&
				droppingColumn !== undefined &&
				!hasCollisions(
					renderedBoard,
					droppingShape,
					droppingRow,
					droppingColumn,
				)
			) {
				addShapeToBoard(
					renderedBoard,
					droppingBlock,
					droppingShape,
					droppingRow,
					droppingColumn,
				);
			}
		}
	}

	console.log("renderedBoard", renderedBoard);
	return {
		board: renderedBoard,
		startGame,
		isPlaying,
		score,
		upcomingBlocks,
		highScores: getHighScores(),
	};
}

function getPoints(numCleared: number): number {
	switch (numCleared) {
		case 0:
			return 0;
		case 1:
			return 100;
		case 2:
			return 300;
		case 3:
			return 500;
		case 4:
			return 800;
		default:
			throw new Error("Unexpected number of rows cleared");
	}
}

export function addShapeToBoard(
	board: BoardShape,
	droppingBlock: Block,
	droppingShape: BlockShape,
	droppingRow: number,
	droppingColumn: number,
) {
	droppingShape
		.filter((row) => row.some((isSet) => isSet))
		.forEach((row: boolean[], rowIndex: number) => {
			row.forEach((isSet: boolean, colIndex: number) => {
				if (isSet) {
					board[droppingRow + rowIndex][droppingColumn + colIndex] =
						droppingBlock;
				}
			});
		});
}
