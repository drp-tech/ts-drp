import Cell from "./Cell";
import type { BoardShape } from "../types";

interface Props {
	currentBoard: BoardShape;
}

function Board({ currentBoard }: Props) {
	return (
		<div className="max-h-[800px] w-fit flex flex-col gap-0.5 border-1">
			{currentBoard.map((row, rowIndex) => (
				<div className="grid grid-cols-10 gap-x-0.5" key={`row-${rowIndex}`}>
					{row.map((cell, colIndex) => (
						<Cell key={`cell-${rowIndex}-${colIndex}`} type={cell} />
					))}
				</div>
			))}
		</div>
	);
}

export default Board;
