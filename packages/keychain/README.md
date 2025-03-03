# @ts-drp/keychain

The `@ts-drp/keychain` package provides a simple interface for generating and managing cryptographic keys used in the DRP (Distributed Real-Time Programs) protocol. It utilizes the `@chainsafe/bls` library for generating BLS (Boneh-Lynn-Shacham) keys and the `@libp2p/crypto` library for generating Ed25519 keys.

## Installation

You can install the package using npm or pnpm:

```bash
npm install @ts-drp/keychain
```

or

```bash
pnpm add @ts-drp/keychain
```

## Usage

Import the `Keychain` class from the package:

```typescript
import { Keychain } from "@ts-drp/keychain";
```

Create a new instance of the `Keychain` class:

```typescript
const keychain = new Keychain();
```

You can optionally provide a configuration object with a `private_key_seed` property. If provided, the keychain will generate deterministic keys based on the seed. Otherwise, it will generate random keys:

```typescript
const keychain = new Keychain({ private_key_seed: "my-secret-seed" });
```

Before using the keychain, you need to start it:

```typescript
await keychain.start();
```

The `Keychain` class provides the following methods:

### `getPublicCredential()`

Returns a `DRPPublicCredential` object containing the base64-encoded Ed25519 and BLS public keys.

```typescript
const publicCredential = keychain.getPublicCredential();
console.log(publicCredential);
// Output: { ed25519PublicKey: '...', blsPublicKey: '...' }
```

### `signWithEd25519(data: string)`

Signs the provided data using the Ed25519 private key and returns the signature as a `Uint8Array`.

```typescript
const data = "Hello, World!";
const signature = await keychain.signWithEd25519(data);
console.log(signature);
// Output: Uint8Array(64) [...]
```

### `signWithBls(data: string)`

Signs the provided data using the BLS private key and returns the signature as a `Uint8Array`.

```typescript
const data = "Hello, World!";
const signature = keychain.signWithBls(data);
console.log(signature);
// Output: Uint8Array(48) [...]
```

### `ed25519PrivateKey`

A getter property that returns the raw Ed25519 private key as a `Uint8Array`.

```typescript
const privateKey = keychain.ed25519PrivateKey;
console.log(privateKey);
// Output: Uint8Array(32) [...]
```
