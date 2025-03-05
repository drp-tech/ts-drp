import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
	testDir: "./examples/grid/e2e",
	/* Run tests in files in parallel */
	fullyParallel: true,
	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: !!process.env.CI,
	/* Retry on CI only */
	retries: process.env.CI ? 2 : 0,
	/* Opt out of parallel tests on CI. */
	workers: 1,
	/* Reporter to use. See https://playwright.dev/docs/test-reporters */
	reporter: "html",
	/* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
	use: {
		/* Base URL to use in actions like `await page.goto('/')`. */
		baseURL: "http://localhost:5173",

		/* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
		trace: "on-first-retry",
	},

	/* Configure projects for major browsers */
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		// for the moment firefox is not working in github actions
		// https://bugzilla.mozilla.org/show_bug.cgi?id=1659672
		// https://github.com/libp2p/js-libp2p/issues/2047#issuecomment-2585764533
		// https://github.com/libp2p/js-libp2p/issues/2572
		//{
		//	name: "firefox",
		//	use: {
		//		...devices["Desktop Firefox"],
		//},
		{
			name: "webkit",
			use: { ...devices["Desktop Safari"] },
		},
	],

	/* Run your local dev server before starting the tests */
	webServer: [
		{
			cwd: "examples/grid",
			stdout: "pipe",
			command: "pnpm dev",
			url: "http://localhost:5173",
			reuseExistingServer: !process.env.CI,
			timeout: 10000,
			env: {
				VITE_BOOTSTRAP_PEERS: [
					"/ip4/127.0.0.1/tcp/50000/ws/p2p/16Uiu2HAkyHjtPSYAveXoTGMskeGWwP7FmbkR29EJJRsmixeAM2xn",
				].join(","),
			},
		},
		{
			command: "pnpm cli --config configs/e2e-bootstrap.json > test.e2e.log",
			url: "http://localhost:50000",
			reuseExistingServer: !process.env.CI,
		},
	],
});
