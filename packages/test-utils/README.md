# @ts-drp/test-utils

A collection of utility classes and functions for testing DRP (Distributed Real-Time Programs) implementations in TypeScript.

## Installation

```bash
pnpm install @ts-drp/test-utils
```

## Features

### AsyncCounterDRP

A test implementation of the `IDRP` interface that provides asynchronous counter functionality. This is useful for testing DRP systems with async operations.

```typescript
import { AsyncCounterDRP } from '@ts-drp/test-utils';

// Create a new counter with an optional initial value
const counter = new AsyncCounterDRP(0);

// Increment the counter (async)
await counter.increment(); // Returns 1

// Decrement the counter (async)
await counter.decrement(); // Returns 0

// Query the current value (sync)
const currentValue = counter.query_value(); // Returns 0
```

## Development

This package is part of the ts-drp monorepo. To contribute:

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Build the package: `pnpm build`
4. Run tests: `pnpm test`

## License

MIT
