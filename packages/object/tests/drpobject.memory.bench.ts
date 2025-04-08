import { formatOutput } from "@ts-drp/utils/memory-benchmark";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const DIR_NAME = path.dirname(new URL(import.meta.url).pathname);
const TEST_FILE_DIR = "memory-tests";

const TEST_FILES = fs
	.readdirSync(path.join(DIR_NAME, TEST_FILE_DIR))
	.map((file) => path.join(DIR_NAME, TEST_FILE_DIR, file))
	.filter((file) => fs.statSync(file).isFile() && file.endsWith(".ts"));

const ITERATIONS_PER_TEST: Map<string, number> = new Map([["default", 5]]);
const TEST_SIZES: Map<string, number[]> = new Map([["default", [100, 1000]]]);

/**
 * Set the test sizes for a given test file from just the file name
 * @param testFile - The name of the test file
 * @param sizes - The sizes to test
 */
function setTestSizes(testFile: string, sizes: number[]): void {
	const testFilePath = path.join(DIR_NAME, TEST_FILE_DIR, testFile).concat(".ts");
	TEST_SIZES.set(testFilePath, sizes);
}

/**
 * Trim the test file path to just the file name
 * @param testFilePath - The path to the test file
 * @returns The file name of the test file
 */
function trimTestFilePath(testFilePath: string): string {
	return testFilePath.replace(path.join(DIR_NAME, TEST_FILE_DIR), "").replace(".ts", "").replace("/", "");
}

/**
 * Run the process memory script and return the memory usage results
 * @param numTests - The number of tests to run
 * @param programName - The name of the program to run
 * @param size - The number of vertices in the hashgraph
 * @returns The memory usage results
 */
function runProcessMemoryScript(numTests: number, programName: string, size: number): number[] {
	const logPath = path.join(DIR_NAME, "program_log");
	try {
		const memoryResults: number[] = [];
		for (let i = 0; i < numTests; i++) {
			const command = `command time -f "%M" tsx ${programName} ${size.toString()} >/dev/null 2>${logPath}`;
			execSync(command, { encoding: "utf-8" });
			const programLog = fs.readFileSync(logPath, "utf-8");
			memoryResults.push(parseInt(programLog, 10));
		}

		execSync(`rm ${logPath}`);
		return memoryResults;
	} catch (error) {
		execSync(`rm ${logPath}`);
		console.error(error);
		return [];
	}
}

function main(): void {
	setTestSizes("SetDRP-object", [100, 1000, 3000]);
	setTestSizes("grid-object", [100, 1000, 3000]);

	for (const testFile of TEST_FILES) {
		for (const testSize of TEST_SIZES.get(testFile) || TEST_SIZES.get("default") || []) {
			const memoryResults = runProcessMemoryScript(
				ITERATIONS_PER_TEST.get(testFile) || ITERATIONS_PER_TEST.get("default") || 5,
				testFile,
				testSize
			);

			if (memoryResults.length > 0) {
				console.log(
					formatOutput(
						`${trimTestFilePath(testFile)} with ${testSize} vertices memory usage`,
						memoryResults,
						"MB",
						1024
					)
				);
			} else {
				console.log("No results received from script");
			}
		}
	}
}

main();
