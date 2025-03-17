declare global {
	interface Process {
		uptime(): number;
		hrtime(): [number, number];
	}
}

if (typeof process.uptime !== "function") {
	const startTime = performance.now();

	process.uptime = (): number => {
		return (performance.now() - startTime) / 1000;
	};
}

if (typeof process.hrtime !== "function") {
	const baseTime = performance.now();

	const hrtimeFunction = (time?: [number, number]): [number, number] => {
		const now = performance.now();
		const elapsedMs = now - baseTime;
		const seconds = Math.floor(elapsedMs / 1000);
		const nanoseconds = Math.floor((elapsedMs % 1000) * 1e6);

		if (time) {
			let diffSeconds = seconds - time[0];
			let diffNanoseconds = nanoseconds - time[1];

			if (diffNanoseconds < 0) {
				diffSeconds -= 1;
				diffNanoseconds += 1e9;
			}
			return [diffSeconds, diffNanoseconds];
		}

		return [seconds, nanoseconds];
	};

	hrtimeFunction.bigint = (): bigint => {
		const now = performance.now();
		const elapsedMs = now - baseTime;
		return BigInt(Math.floor(elapsedMs * 1e6));
	};

	process.hrtime = hrtimeFunction;
}
