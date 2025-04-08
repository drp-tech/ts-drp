import { createContext, useEffect, useState } from "react";
import { Tetris } from "../drp/Tetris";
import type { IDRPObject } from "@ts-drp/types";
import { DRPNode } from "@ts-drp/node";

interface TetrisContextType {
	tetris: IDRPObject<Tetris> | null;
	drpNode: DRPNode | null;
}

export const TetrisContext = createContext<TetrisContextType>({
	tetris: null,
	drpNode: null,
});

export const TetrisProvider = ({ children }: { children: React.ReactNode }) => {
	const [tetris, setTetris] = useState<IDRPObject<Tetris> | null>(null);
	const [drpNode, setDrpNode] = useState<DRPNode | null>(null);

	useEffect(() => {
		let mounted = true;

		const drpNode = new DRPNode();
		console.log("drpNode", drpNode);

		drpNode.start().then(async () => {
			if (mounted) {
				setDrpNode(drpNode);
			}
			const object = await drpNode.createObject({
				id: "tetris",
				drp: new Tetris(),
			});
			setTetris(object);
		});

		return () => {
			mounted = false;
		};
	}, []);

	return (
		<TetrisContext.Provider value={{ tetris, drpNode }}>
			{children}
		</TetrisContext.Provider>
	);
};
