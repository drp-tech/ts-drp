import { run } from "./runner.js";

run().catch((e) => console.error("Failed to start node: ", e));
