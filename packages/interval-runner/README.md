# IntervalRunner

A flexible and powerful utility for running functions at specified intervals with smart execution control.

## Features

- ⏱️ Run functions at specified intervals (in milliseconds)
- 🛑 Smart stopping mechanism - functions can self-terminate by returning `false`
- 🔄 Supports various function types:
  - Regular synchronous functions
  - Promises / async functions
  - Generators
  - Async generators
- 🧩 Pass arguments to your interval functions

## Installation

```bash
pnpm install @ts-drp/interval-runner
```

## Usage

### Basic Example

```typescript
import { IntervalRunner } from "@ts-drp/interval-runner";

// Create an interval runner that executes every 5 seconds
const runner = new IntervalRunner({
  interval: 5000,
  fn: () => {
    console.log("Executing task...");
    return true; // Return true to continue the interval
  }
});

// Start the runner
runner.start();

// Later, stop the runner when needed
runner.stop();
```

### Self-terminating Interval

```typescript
import { IntervalRunner } from "@ts-drp/interval-runner";

let count = 0;
const runner = new IntervalRunner({
  interval: 1000,
  fn: () => {
    console.log(`Execution #${++count}`);
    
    // Automatically stop after 5 executions
    return count < 5;
  }
});

runner.start();
```

### With Async Functions

```typescript
import { IntervalRunner } from "@ts-drp/interval-runner";

const runner = new IntervalRunner({
  interval: 10000,
  fn: async () => {
    console.log("Starting async operation...");
    
    // Simulate an API call
    const result = await fetchSomeData();
    console.log("Data fetched:", result);
    
    return true;
  }
});

runner.start();
```

### With Generators

```typescript
import { IntervalRunner } from "@ts-drp/interval-runner";

const runner = new IntervalRunner({
  interval: 3000,
  fn: function* () {
    console.log("Starting generator execution");
    
    // You can yield multiple values
    yield true; // Continue the interval
    
    // The last yielded value determines whether the interval continues
    return false; // Stop the interval
  }
});

runner.start();
```

### Passing Arguments

```typescript
import { IntervalRunner } from "@ts-drp/interval-runner";

const runner = new IntervalRunner<[string, number]>({
  interval: 2000,
  fn: (name, count) => {
    console.log(`Hello ${name}, count: ${count}`);
    return true;
  }
});

// Pass arguments when starting
runner.start(["World", 42]);
```

## API

### Constructor

```typescript
new IntervalRunner(options: IntervalRunnerOptions)
```

#### Options

- `interval`: The interval in milliseconds (must be > 0)
- `fn`: The function to execute at each interval
- `logConfig`: Optional logging configuration

### Methods

#### `start(args?: Args): void`

Starts the interval runner. Optionally accepts arguments to pass to the function.

#### `stop(): void`

Stops the interval runner.

### Properties

#### `interval: number`

The interval in milliseconds.

#### `state: "running" | "stopped"`

The current state of the interval runner.

## License

[MIT](../../LICENSE)
