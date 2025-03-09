import { type Page, expect, test } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const peersSelector = "#peers";
const peerIdSelector = "#peerIdExpanded";
const DRPIdInputSelector = "#gridInput";
const joinGridButtonSelector = "#joinGrid";
const objectPeersSelector = "#objectPeers";

/**
 * Monitors a file for matches of a search pattern until the desired number of matches is found
 *
 * @example
 * // Match string pattern
 * await chackFileUntilMatches("test.log", () => "Server started");
 *
 * // Match regex pattern (including multiline)
 * await chackFileUntilMatches("test.log", () => /Error:\n.*at .*\/s);
 *
 * @param filePath - Path to the file to monitor
 * @param searchPattern - String or RegExp to match against file content
 * @returns Promise that resolves when the required matches are found
 */
function chackFileUntilMatches(
	filePath: string,
	searchPattern: () => string | RegExp
): Promise<void> {
	return new Promise((resolve, reject) => {
		const intervalMs = 300;

		const interval = setInterval(() => {
			fs.readFile(filePath, "utf8", (err, content) => {
				if (err) {
					clearInterval(interval);
					return reject(err);
				}

				const matches =
					typeof searchPattern === "string"
						? content.match(new RegExp(searchPattern, "g"))
						: content.match(searchPattern());

				if (matches) {
					clearInterval(interval);
					resolve();
				}
			});
		}, intervalMs);
	});
}

async function clearLogFile(): Promise<void> {
	const logPath = path.join(process.cwd(), "test.e2e.log");
	await fs.promises.writeFile(logPath, "");
}

interface GlowingPeer {
	peerID: string;
	left: number;
	top: number;
}

async function getGlowingPeer(page: Page, peerID: string): Promise<GlowingPeer> {
	const div = page.locator(`div[data-glowing-peer-id="${peerID}"]`);
	const style = await div.getAttribute("style");
	if (!style) throw new Error("style is not defined");

	const matchPeerID = style.match(/glow-([a-zA-Z0-9]+)/);
	if (!matchPeerID) throw new Error("matchPeerID is not defined");

	const matchLeft = style.match(/left: ([0-9]+)px/);
	const matchTop = style.match(/top: ([0-9]+)px/);
	if (!matchLeft || !matchTop) throw new Error("matchLeft or matchTop is not defined");

	return {
		peerID: matchPeerID[1],
		left: Number.parseInt(matchLeft[1]),
		top: Number.parseInt(matchTop[1]),
	};
}

async function getPeerID(page: Page): Promise<string> {
	const peerID = await (
		await page.waitForSelector(peerIdSelector, {
			timeout: 10000,
			state: "attached",
		})
	).textContent();
	if (!peerID) throw new Error("peerID is not defined");
	return peerID.trim();
}

function getPeerIDRegex(peerID: string): RegExp {
	return new RegExp(
		`peerId: PeerId\\(${peerID}\\),.*?signedPeerRecord: {\\n.*?addresses: \\[\\n      Multiaddr\\(/ip4/127\\.0\\.0\\.1/tcp/50000/ws/p2p/16Uiu2HAmTY71bbCHtmYD3nvVKUGbk7NWqLBbPFNng4jhaXJHi3W5/p2p-circuit\\)`,
		"gms"
	);
}

test.describe("grid", () => {
	let page1: Page;
	let page2: Page;

	test.beforeEach(async ({ browser }) => {
		await clearLogFile();

		page1 = await browser.newPage();
		let peerID1 = "";
		await Promise.all([
			(async (): Promise<void> => {
				await page1.goto("/");
				await page1.waitForSelector("#loadingMessage", { state: "hidden" });
				peerID1 = await getPeerID(page1);
			})(),
			chackFileUntilMatches("test.e2e.log", () => getPeerIDRegex(peerID1)),
		]);

		page2 = await browser.newPage();
		await page2.goto("/");
		await page2.waitForSelector("#loadingMessage", { state: "hidden" });
	});

	test("check peerID", async () => {
		await expect(page1).toHaveTitle(/DRP - Grid/);
		await expect(page2).toHaveTitle(/DRP - Grid/);

		await expect(page1.locator(peerIdSelector)).not.toBeEmpty({
			timeout: 10000,
		});
		await expect(page2.locator(peerIdSelector)).not.toBeEmpty({
			timeout: 10000,
		});

		const peerID1 = await getPeerID(page1);
		const peerID2 = await getPeerID(page2);

		await expect(page1.locator(peersSelector)).toContainText(peerID2, {
			timeout: 10000,
		});
		await expect(page2.locator(peersSelector)).toContainText(peerID1, {
			timeout: 10000,
		});
	});

	test("check peers are moving", async () => {
		const peerID1 = await getPeerID(page1);
		const peerID2 = await getPeerID(page2);

		const drpId = `test-drp-id-${Math.random().toString(36).substring(2, 15)}`;
		await page1.fill(DRPIdInputSelector, drpId);
		await page1.click(joinGridButtonSelector);
		await page2.fill(DRPIdInputSelector, drpId);
		await page2.click(joinGridButtonSelector);

		await expect(page1.locator(objectPeersSelector)).toContainText(peerID2, {
			timeout: 10000,
		});
		await expect(page2.locator(objectPeersSelector)).toContainText(peerID1, {
			timeout: 10000,
		});

		await page1.keyboard.press("w");
		await page2.keyboard.press("s");

		await expect(page1.locator(DRPIdInputSelector)).toHaveValue(drpId);
		await expect(page2.locator(DRPIdInputSelector)).toHaveValue(drpId);

		await expect(page2.locator(`div[data-glowing-peer-id="${peerID1}"]`)).toBeVisible({
			timeout: 10000,
		});
		await expect(page2.locator(`div[data-glowing-peer-id="${peerID2}"]`)).toBeVisible({
			timeout: 10000,
		});

		const glowingPeer1 = await getGlowingPeer(page1, peerID1);
		const glowingPeer2 = await getGlowingPeer(page1, peerID2);
		expect(Math.abs(glowingPeer1.top - glowingPeer2.top)).toBe(100);
	});
});
