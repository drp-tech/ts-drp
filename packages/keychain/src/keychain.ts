import bls from "@chainsafe/bls/herumi";
import type { SecretKey as BlsSecretKey } from "@chainsafe/bls/types";
import { deriveKeyFromEntropy } from "@chainsafe/bls-keygen";
import { generateKeyPair, privateKeyFromRaw } from "@libp2p/crypto/keys";
import type { Secp256k1PrivateKey } from "@libp2p/interface";
import { etc, signAsync } from "@noble/secp256k1";
import type { DRPPublicCredential } from "@ts-drp/object";
import * as crypto from "crypto";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";

export interface KeychainConfig {
	private_key_seed?: string;
}

export class Keychain {
	private _config?: KeychainConfig;
	private _secp256k1PrivateKey?: Secp256k1PrivateKey;
	private _blsPrivateKey?: BlsSecretKey;

	constructor(config?: KeychainConfig) {
		this._config = config;
	}

	async start() {
		if (this._config?.private_key_seed) {
			const tmp = this._config.private_key_seed.padEnd(64, "0");
			const seed = uint8ArrayFromString(tmp);
			const rawPrivateKey = etc.hashToPrivateKey(seed);
			this._secp256k1PrivateKey = privateKeyFromRaw(rawPrivateKey) as Secp256k1PrivateKey;
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
			secp256k1PublicKey: uint8ArrayToString(this._secp256k1PrivateKey?.publicKey.raw, "base64"),
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
