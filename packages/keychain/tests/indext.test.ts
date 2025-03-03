import { describe, expect, test } from "vitest";

import { Keychain } from "../src/keychain.js";

describe("Keychain tests", () => {
	test("Should be able to start without a seed", async () => {
		const keychain = new Keychain();
		await keychain.start();
		expect(keychain.getPublicCredential()).toBeTruthy();
		expect(keychain.signWithBls("data")).toBeTruthy();
		await expect(keychain.signWithSecp256k1("data")).resolves.toBeTruthy();
	});

	test("Should be able to start with a seed", async () => {
		const keychain = new Keychain({ private_key_seed: "seed" });
		await keychain.start();
		expect(keychain.getPublicCredential()).toBeTruthy();
		expect(keychain.signWithBls("data")).toBeTruthy();
		await expect(keychain.signWithSecp256k1("data")).resolves.toBeTruthy();
	});

	test("Should return 65 bytes signature for secp256k1", async () => {
		const keychain = new Keychain();
		await keychain.start();
		const signature = await keychain.signWithSecp256k1("data");
		expect(signature.length).toBe(65);
	});

	test("Should not be able to sign when the keychain is not started", async () => {
		const keychain = new Keychain();
		expect(() => keychain.signWithBls("data")).toThrowError("Private key not found");
		await expect(keychain.signWithSecp256k1("data")).rejects.toThrowError("Private key not found");
	});
});
