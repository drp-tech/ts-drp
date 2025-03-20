import * as fs from "node:fs";
import path from "node:path";
const lcovPath = path.resolve("./coverage/lcov.info");
const threshold = 70; // Set your desired threshold

function parseCoverage(lcovFilePath: string): number {
	if (!fs.existsSync(lcovFilePath)) {
		throw new Error(`File not found: ${lcovFilePath}`);
	}

	const lcovData = fs.readFileSync(lcovFilePath, "utf-8");
	const totalLinesMatch = lcovData.match(/LF:(\d+)/g);
	const coveredLinesMatch = lcovData.match(/LH:(\d+)/g);

	if (!totalLinesMatch || !coveredLinesMatch) {
		throw new Error("Coverage data is missing or invalid in lcov.info");
	}

	const totalLines = totalLinesMatch
		.map((line) => Number.parseInt(line.split(":")[1], 10))
		.reduce((sum, value) => sum + value, 0);

	const coveredLines = coveredLinesMatch
		.map((line) => Number.parseInt(line.split(":")[1], 10))
		.reduce((sum, value) => sum + value, 0);

	return (coveredLines / totalLines) * 100;
}

try {
	const coveragePercentage = parseCoverage(lcovPath);
	console.log(`Total Coverage: ${coveragePercentage.toFixed(2)}%`);

	if (coveragePercentage < threshold) {
		console.error(`Coverage (${coveragePercentage.toFixed(2)}%) is below the threshold (${threshold}%).`);
		process.exit(1); // Exit with an error code if threshold is not met
	} else {
		console.log(`Coverage (${coveragePercentage.toFixed(2)}%) meets the threshold (${threshold}%).`);
	}
} catch (error) {
	console.error(`Error: ${(error as Error).message}`);
	process.exit(1); // Exit with an error code for any script failure
}
