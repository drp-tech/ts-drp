# @ts-drp/keychain

The `@ts-drp/keychain` package provides a simple interface for generating and managing cryptographic keys used in the DRP (Distributed Real-Time Programs) protocol. It utilizes the `@chainsafe/bls` library for generating BLS (Boneh-Lynn-Shacham) keys and the `@noble/secp256k1` library for generating Secp256k1 keys.

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

### `signWithSecp256k1(data: string)`

Signs the provided data using the Secp256k1 private key and returns the signature as a `Uint8Array`.

```typescript
const data = "Hello, World!";
const signature = await keychain.signWithSecp256k1(data);
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

### `secp256k1PublicKey`

A getter property that returns the Secp256k1 public key as a base64-encoded string.

```typescript
const secpPublicKey = keychain.secp256k1PublicKey;
console.log("Secp256k1 Public Key:", secpPublicKey);
// Output: Base64 encoded string representing the Secp256k1 public key.
```

### `blsPublicKey`

A getter property that returns the Bls public key as a base64-encoded string.

```typescript
const blsPublicKey = keychain.blsPublicKey;
console.log("Bls Public Key:", blsPublicKey);
// Output: Base64 encoded string representing the Bls public key.
```

### `secp256k1PrivateKey`

A getter property that returns the raw Secp256k1 private key as a `Uint8Array`.

```typescript
const privateKey = keychain.secp256k1PrivateKey;
console.log(privateKey);
// Output: Uint8Array(32) [...]
```
