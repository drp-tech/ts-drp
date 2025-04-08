import { useContext, useEffect, useState } from "react";
import "./App.css";
import Board from "./components/Board";
import { TetrisContext } from "./context/tetris";
import { useTetris } from "./hooks/useTetris";

function App() {
	const { tetris, drpNode: node } = useContext(TetrisContext);
	console.log("tetris", tetris);
	const [peers, setPeers] = useState<string[]>([]);
	const [peerId, setPeerId] = useState<string | null>(null);
	const [hashGraphNode, setHashGraphNode] = useState<number>(0);
	const { board, startGame } = useTetris(tetris, node);

	useEffect(() => {
		if (!node || !tetris) return;
		setPeerId(node.networkNode.peerId);
		setInterval(() => {
			setPeers(node.networkNode.getAllPeers());
			setHashGraphNode(tetris.hashGraph.vertices.size);
		}, 1000);
	}, [node, tetris]);

	return (
		<div className="">
			<div className="flex flex-col gap-2">
				<div>Peer ID: {peerId}</div>
				<div>Hash Graph Node: {hashGraphNode}</div>
			</div>
			{board && <Board currentBoard={board} />}
			<div className="flex gap-2">
				<button onClick={startGame} type="button">
					Start
				</button>
			</div>
		</div>
	);
}

export default App;
