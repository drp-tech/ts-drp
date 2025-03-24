import { SetDRP } from "@ts-drp/blueprints";
import fs from "fs";
import * as pprof from "pprof";

import { DRPObject, ObjectACL } from "../src/index.js";

const acl = new ObjectACL({
	admins: ["peer1"],
});

type DRPManipulationStrategy = (drp: SetDRP<number>, value: number) => void;

const createWithStrategy = (
	peerId: number,
	verticesPerDRP: number,
	strategy: DRPManipulationStrategy
): DRPObject<SetDRP<number>> => {
	const obj = new DRPObject({
		peerId: `peer1_${peerId}`,
		acl,
		drp: new SetDRP<number>(),
	});

	if (!obj.drp) throw new Error("DRP is undefined");

	for (let i = 0; i < verticesPerDRP; i++) {
		strategy(obj.drp, i);
	}

	return obj;
};
const manipulationStrategies: DRPManipulationStrategy[] = [
	(drp, value): void => drp.add(value),
	(drp, value): void => {
		drp.delete(value);
		drp.add(value);
	},
	(drp, value): void => {
		drp.add(value);
		drp.delete(value);
	},
];

function createDRPObjects(numDRPs: number, verticesPerDRP: number): DRPObject<SetDRP<number>>[] {
	return Array.from({ length: numDRPs }, (_, peerId) =>
		createWithStrategy(peerId, verticesPerDRP, manipulationStrategies[peerId % 3])
	);
}

async function mergeObjects(objects: DRPObject<SetDRP<number>>[]): Promise<void> {
	for (const [sourceIndex, sourceObject] of objects.entries()) {
		for (const [targetIndex, targetObject] of objects.entries()) {
			if (sourceIndex !== targetIndex) {
				await sourceObject.merge(targetObject.hashGraph.getAllVertices());
			}
		}
	}
}

async function flamegraphForSetDRP(numDRPs: number, verticesPerDRP: number, mergeFn: boolean): Promise<void> {
	console.log("start to profile >>>");
	const stopFn = pprof.time.start();
	const objects = createDRPObjects(numDRPs, verticesPerDRP);

	if (mergeFn) {
		await mergeObjects(objects);
	}

	const profile = stopFn();
	const buf = await pprof.encode(profile);
	fs.writeFile("flamegraph.pprof", buf, (err) => {
		if (err) {
			throw err;
		}
	});
	console.log("<<< finished to profile");
}

flamegraphForSetDRP(1, 1000, false).catch(console.error);
