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
- `close(): void` - Closes the queue

### `MessageQueueManager<T>`

- `enqueue(queueId: string, message: T): Promise<void>` - Enqueues a message to the queue for the given queue ID
- `subscribe(queueId: string, handler: (message: T) => Promise<void>): void` - Subscribes to messages for the given queue ID
- `close(queueId: string): void` - Closes the queue for the given queue ID
- `closeAll(): void` - Closes all queues
