import type { CellOptions } from "../types";

interface Props {
	type: CellOptions;
}

function Cell({ type }: Props) {
	return <div className={`border-1 cell ${type} w-[50px] h-[50px]`} />;
}

export default Cell;
