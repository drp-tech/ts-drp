import { bls } from "@chainsafe/bls/herumi";
import { SetDRP } from "@ts-drp/blueprints/src/index.js";
import { Keychain } from "@ts-drp/keychain/src/keychain.js";
import { toString as uint8ArrayToString } from "uint8arrays";
import { beforeEach, describe, expect, test } from "vitest";

import { ObjectACL } from "../src/acl/index.js";
import { FinalityState, FinalityStore } from "../src/finality/index.js";
import { BitSet } from "../src/hashgraph/bitset.js";
import { DRPObject } from "../src/index.js";
import type { AggregatedAttestation } from "../src/proto/drp/object/v1/object_pb.js";

// initialize log
const _ = new DRPObject({
	peerId: "peer1",
	acl: new ObjectACL({ admins: new Map() }),
	drp: new SetDRP(),
});

describe("Tests for FinalityState", () => {
	const N = 128;
	let finalityState: FinalityState;
	const peers: string[] = [];
	const stores: Keychain[] = [];

	beforeEach(async () => {
		for (let i = 0; i < N; i++) {
			peers.push(uint8ArrayToString(crypto.getRandomValues(new Uint8Array(32)), "hex"));
		}
		peers.sort();

		for (let i = 0; i < N; i++) {
			stores.push(new Keychain());
			await stores[i].start();
		}

		const signers = new Map();
		for (let i = 0; i < N; i++) {
			signers.set(peers[i], stores[i].getPublicCredential());
		}
		finalityState = new FinalityState("vertex1", signers);
	});

	test("addSignature: Nodes outside the signer set are rejected", async () => {
		const keychain = new Keychain();
		await keychain.start();

		const signature = keychain.signWithBls(finalityState.data);

		expect(() => finalityState.addSignature("badNode", signature)).toThrowError(
			"Peer not found in signer list"
		);
	});

	test("addSignature: Bad signatures are rejected", async () => {
		const keychain = new Keychain();
		await keychain.start();

		const signature = keychain.signWithBls(finalityState.data);

		expect(() => finalityState.addSignature(peers[0], signature)).toThrowError("Invalid signature");
	});

	test("addSignature: signatures are counted correctly", async () => {
		let count = 0;
		for (let i = 0; i < N; i++) {
			const signature = stores[i].signWithBls(finalityState.data);
			finalityState.addSignature(peers[i], signature);
			count++;
			expect(finalityState.numberOfSignatures).toEqual(count);
		}
		for (let i = 0; i < count; i++) {
			expect(finalityState.aggregation_bits.get(i)).toEqual(true);
		}
	});

	test("Duplicated signatures", async () => {
		finalityState.addSignature(peers[0], stores[0].signWithBls(finalityState.data));
		finalityState.addSignature(peers[0], stores[0].signWithBls(finalityState.data));
		expect(finalityState.numberOfSignatures).toEqual(1);
	});
});

describe("Tests for FinalityStore", () => {
	const N = 1000;
	let finalityStore: FinalityStore;
	const peers: string[] = [];
	const stores: Keychain[] = [];

	const generateAttestation = (index: number, hash: string) => {
		return {
			data: hash,
			signature: stores[index].signWithBls(hash),
		};
	};

	beforeEach(async () => {
		finalityStore = new FinalityStore({ finality_threshold: 0.51 });

		for (let i = 0; i < N; i++) {
			peers.push(uint8ArrayToString(crypto.getRandomValues(new Uint8Array(32)), "hex"));
		}
		peers.sort();

		for (let i = 0; i < N; i++) {
			stores.push(new Keychain());
			await stores[i].start();
		}

		const signers = new Map();
		for (let i = 0; i < N; i++) {
			signers.set(peers[i], stores[i].getPublicCredential());
		}
		finalityStore.initializeState("vertex1", signers);
		finalityStore.initializeState("vertex2", signers);
		finalityStore.initializeState("vertex3", signers);
	});

	test("Runs addSignatures, canSign and signed on 100 attestations", async () => {
		for (let i = 0; i < 100; i++) {
			const peerId = peers[i];
			const hash = "vertex1";
			expect(finalityStore.canSign(peerId, hash)).toEqual(true);
			expect(finalityStore.signed(peerId, hash)).toEqual(false);

			const attestation = generateAttestation(i, hash);
			finalityStore.addSignatures(peerId, [attestation]);
			expect(finalityStore.signed(peerId, hash)).toEqual(true);
		}

		// invalid peer
		finalityStore.addSignatures("badNode", []);
		expect(finalityStore.getNumberOfSignatures("vertex1")).toEqual(100);
	});

	test("mergeSignatures: Merge signatures for multiple vertices", async () => {
		const attestations: AggregatedAttestation[] = [];

		// signatures for vertex1
		for (let i = 0; i < 10; i++) {
			const signature = stores[i].signWithBls("vertex1");
			const bits = new BitSet(N);
			bits.set(i, true);

			attestations.push({
				data: "vertex1",
				signature,
				aggregationBits: bits.toBytes(),
			});
		}

		// signatures for vertex2
		const signatures: Uint8Array[] = [];
		const bitset = new BitSet(N);
		for (let i = 0; i < 50; i++) {
			signatures.push(stores[i].signWithBls("vertex2"));
			bitset.set(i, true);
		}
		const aggregatedSignature = bls.aggregateSignatures(signatures);
		attestations.push({
			data: "vertex2",
			signature: aggregatedSignature,
			aggregationBits: bitset.toBytes(),
		});

		// signatures for vertex3
		// invalid signature
		attestations.push({
			data: "vertex3",
			signature: stores[0].signWithBls("vertex3"),
			aggregationBits: new BitSet(N).toBytes(),
		});

		finalityStore.mergeSignatures(attestations);

		// the merge function only accepts the first merge
		expect(finalityStore.getNumberOfSignatures("vertex1")).toEqual(1);
		expect(finalityStore.getNumberOfSignatures("vertex2")).toEqual(50);
		expect(finalityStore.getAttestation("vertex2")?.signature).toEqual(aggregatedSignature);
		expect(finalityStore.getNumberOfSignatures("vertex3")).toEqual(0);
	});

	test("Quorum test", async () => {
		for (let i = 0; i < 509; i++) {
			const attestation = generateAttestation(i, "vertex1");
			finalityStore.addSignatures(peers[i], [attestation]);
		}
		expect(finalityStore.isFinalized("vertex1")).toEqual(false);

		for (let i = 509; i < 510; i++) {
			const attestation = generateAttestation(i, "vertex1");
			finalityStore.addSignatures(peers[i], [attestation]);
		}
		// 1000 * 0.51 = 510
		expect(finalityStore.isFinalized("vertex1")).toEqual(true);
	}, 30000);
});
