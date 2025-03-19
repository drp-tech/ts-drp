# Channel-Based Message Queue

A lightweight, in-memory channel-based message queue implementation for efficient message passing and processing.

## Features

- Channel-based message passing
- Non-blocking publish/subscribe pattern
- Type-safe message handling
- In-memory message storage
- Async/await support

### `MessageQueue<T>`

- `enqueue(message: T): Promise<void>` - Enqueues a message to the queue
- `subscribe(handler: (message: T) => Promise<void>): void` - Subscribes to messages
- `close(): Promise<void>` - Closes the queue
