# DRP Interval Reconnect Bootstrap

The DRP interval reconnect bootstrap provides automatic reconnection to bootstrap node in the DRP, ensuring reliable connectivity and network resilience

## Overview

The interval reconnect mechanism ensures that nodes can:

- Maintain persistent connections to bootstrap nodes
- Automatically recover from network disruptions

## Architecture

The interval reconnect system consists of three main components:

- `DRPIntervalReconnectBootstrap`: Manages the reconnection process to bootstrap nodes
- `IntervalRunner`: Handles the periodic execution of reconnection tasks
- `NetworkNode`: Handles P2P communication between nodes

## Configuration

```typescript
interface DRPIntervalReconnectOptions {
	/** Unique identifier for the reconnect process */
	readonly id?: string;
	/** Network node instance used for peer communication */
	readonly networkNode: DRPNetworkNode;
	/** Interval in milliseconds between reconnection attempts. Defaults to 60,000ms (1 minute) */
	readonly interval?: number;
	/** Logger configuration options */
	readonly logConfig?: LoggerOptions;
}
```

## Key Features

- Periodic Connection Checks
- Bootstrap Node Reconnection
- Logging and Observability

## Usage

```typescript
import { createDRPReconnectBootstrap } from "@ts-drp/interval-reconnect";

// Create a new reconnect instance
const reconnect = createDRPReconnectBootstrap({
	networkNode: networkNode,
	interval: 60000, // 1 minute
});

// Start the reconnection process
reconnect.start();

// Stop the reconnection process when done
reconnect.stop();
```
