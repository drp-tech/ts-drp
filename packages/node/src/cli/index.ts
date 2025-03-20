import { Command, Option } from "commander";

import { VERSION } from "../version.js";

export const program = new Command();
program.version(VERSION);

program.addOption(new Option("-c, --config <file>", "config file"));
program.addOption(new Option("-m, --mode <mode>", "mode to run in").default("node").choices(["node", "bootstrap"]));
