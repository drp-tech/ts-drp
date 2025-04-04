import { DRPObject } from "@ts-drp/object";

import { Grid } from "./DRPs/grid.js";

if (process.argv.length !== 3) {
	console.error("Please provide a valid number as the size argument");
	process.exit(1);
}

const VERTICES = parseInt(process.argv[2]);
if (isNaN(VERTICES)) {
	console.error("Please provide a valid number as the size argument");
	process.exit(1);
}

// Create a new DRPObject based on the SetDRP blueprint
const object = new DRPObject<Grid>({
	peerId: "peer1",
	drp: new Grid(),
});

for (let i = 0; i < VERTICES; i++) {
	if (i < Math.min(VERTICES, 10)) {
		object.drp?.addUser(`user${i}`, `color${i}`);
	} else {
		object.drp?.moveUser(`user${i % 10}`, `U`);
	}
}
