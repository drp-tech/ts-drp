import { bls } from "@chainsafe/bls/herumi";
import type { SecretKey as BlsSecretKey } from "@chainsafe/bls/types";
import { deriveKeyFromEntropy } from "@chainsafe/bls-keygen";
import { generateKeyPair, privateKeyFromRaw } from "@libp2p/crypto/keys";
import type { Secp256k1PrivateKey } from "@libp2p/interface";
import { etc, signAsync } from "@noble/secp256k1";
import { type DRPPublicCredential } from "@ts-drp/types";
import * as crypto from "crypto";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";

export interface KeychainConfig {
	private_key_seed?: string;
}

export class Keychain {
	private _config?: KeychainConfig;
	// if you are to change the private key type, you need to change the peerId's of the bootstrap nodes
	// and any peerId's that are generated from the private key see e.g: https://github.com/drp-tech/ts-drp/pull/492
	private _secp256k1PrivateKey?: Secp256k1PrivateKey;
	private _blsPrivateKey?: BlsSecretKey;

	constructor(config?: KeychainConfig) {
		this._config = config;
	}

	async start(): Promise<void> {
		if (this._config?.private_key_seed) {
			const seed = crypto.createHash("sha512").update(this._config.private_key_seed).digest();
			const rawSecp256k1PrivateKey = etc.hashToPrivateKey(seed);
			const key = privateKeyFromRaw(rawSecp256k1PrivateKey);
			if (key.type !== "secp256k1") throw new Error("Expected secp256k1 key");
			this._secp256k1PrivateKey = key;
			this._blsPrivateKey = bls.SecretKey.fromBytes(deriveKeyFromEntropy(seed));
		} else {
			this._secp256k1PrivateKey = await generateKeyPair("secp256k1");
			this._blsPrivateKey = bls.SecretKey.fromKeygen();
		}
	}

	getPublicCredential(): DRPPublicCredential {
		if (!this._secp256k1PrivateKey || !this._blsPrivateKey) {
			throw new Error("Private key not found");
		}
		return {
			blsPublicKey: uint8ArrayToString(this._blsPrivateKey?.toPublicKey().toBytes(), "base64"),
		};
	}

	signWithBls(data: string): Uint8Array {
		if (!this._blsPrivateKey) {
			throw new Error("Private key not found");
		}

		return this._blsPrivateKey.sign(uint8ArrayFromString(data)).toBytes();
	}

	async signWithSecp256k1(data: string): Promise<Uint8Array> {
		if (!this._secp256k1PrivateKey) {
			throw new Error("Private key not found");
		}
		const hashData = crypto.createHash("sha256").update(data).digest("hex");

		const signature = await signAsync(hashData, this._secp256k1PrivateKey.raw, {
			extraEntropy: true,
		});

		const compactSignature = signature.toCompactRawBytes();

		const fullSignature = new Uint8Array(1 + compactSignature.length);
		fullSignature[0] = signature.recovery;
		fullSignature.set(compactSignature, 1);

		return fullSignature;
	}

	get secp256k1PrivateKey(): Uint8Array {
		if (!this._secp256k1PrivateKey) {
			throw new Error("Private key not found");
		}
		return this._secp256k1PrivateKey.raw;
	}
}
