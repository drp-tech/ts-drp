import bls from "@chainsafe/bls/herumi";
import type { SecretKey as BlsSecretKey } from "@chainsafe/bls/types";
import { deriveKeyFromEntropy } from "@chainsafe/bls-keygen";
import { generateKeyPair, privateKeyFromRaw } from "@libp2p/crypto/keys";
import type { Ed25519PrivateKey, Secp256k1PrivateKey } from "@libp2p/interface";
import { etc } from "@noble/secp256k1";
import type { DRPPublicCredential } from "@ts-drp/object";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";

export interface KeychainConfig {
	private_key_seed?: string;
}

export class Keychain {
	private _config?: KeychainConfig;
	private _ed25519PrivateKey?: Ed25519PrivateKey;
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

	get ed25519PrivateKey(): Uint8Array {
		if (!this._ed25519PrivateKey) {
			throw new Error("Private key not found");
		}
		return this._ed25519PrivateKey.raw;
	}
}
