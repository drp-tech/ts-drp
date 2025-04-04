import { SetDRP } from "@ts-drp/blueprints";
import { DRPObject } from "@ts-drp/object";

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
const object = new DRPObject<SetDRP<number>>({
	peerId: "peer1",
	drp: new SetDRP<number>(),
});

for (let i = 0; i < VERTICES; i++) {
	if (i % 2 === 1) {
		object.drp?.add(i);
	} else {
		object.drp?.delete(i);
	}
}
