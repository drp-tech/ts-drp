# @ts-drp/types

TypeScript type definitions for the DRP (Distributed Real-Time Programs) system.

## Installation

```bash
pnpm install @ts-drp/types
```

## Overview

This package provides TypeScript type definitions and interfaces for the DRP system, including:

- Protocol buffer message types
- Core DRP interfaces and types
- Network and node-related types
- Hashgraph and finality types
- Interval runner types for various system operations

## Main Types

### Core DRP Types

- `DRPState` - Represents the state of a DRP node
- `DRPObjectBase` - Base type for DRP objects
- `Vertex` and `Operation` - Types for DRP vertices and operations
- `Attestation` and `AggregatedAttestation` - Types for attestations

### Message Types

- `Message` - Base message type
- `MessageType` - Enumeration of message types
- `FetchState` and `FetchStateResponse` - Types for state fetching
- `Update` and `AttestationUpdate` - Types for updates
- `Sync`, `SyncAccept`, `SyncReject` - Types for synchronization
- `DRPDiscovery` and `DRPDiscoveryResponse` - Types for node discovery

### Interval Runners

The package includes types for various interval runners:

```typescript
interface IntervalRunnerMap {
  "interval:runner": IIntervalRunner<"interval:runner">;
  "interval:reconnect": IDRPIntervalReconnectBootstrap;
  "interval:discovery": IDRPIntervalDiscovery;
}
```

## Dependencies

- `@bufbuild/protobuf`: For Protocol Buffer support
- `loglevel`: For logging functionality

### Peer Dependencies

- `@chainsafe/libp2p-gossipsub`
- `@libp2p/interface`
- `@multiformats/multiaddr`

## Development

```bash
# Build the package
pnpm build

# Type checking
pnpm typecheck

# Clean build artifacts
pnpm clean

# Watch mode for development
pnpm watch
```

## License

MIT
