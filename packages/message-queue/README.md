# Channel-Based Message Queue

A lightweight, in-memory channel-based message queue implementation for efficient message passing and processing in TypeScript applications. This package provides a simple yet powerful way to handle asynchronous message passing between different parts of your application.

## Installation

```bash
pnpm install @ts-drp/message-queue
```

## Features

- 🔄 Channel-based message passing
- ⚡ Non-blocking publish/subscribe pattern
- 📝 Type-safe message handling
- 💾 In-memory message storage
- ⏱️ Async/await support
- 🔒 Thread-safe operations

## Usage

### Basic Message Queue

```typescript
import { MessageQueue } from '@ts-drp/message-queue';

// Create a queue for string messages
const queue = new MessageQueue<string>();

// Subscribe to messages
queue.subscribe(async (message) => {
  console.log('Received:', message);
});

// Enqueue a message
await queue.enqueue('Hello, World!');

// Close the queue when done
queue.close();
```

### Message Queue Manager

```typescript
import { MessageQueueManager } from '@ts-drp/message-queue';

// Create a manager for string messages
const manager = new MessageQueueManager<string>();

// Subscribe to messages for a specific queue
manager.subscribe('user-queue', async (message) => {
  console.log('Received user message:', message);
});

// Enqueue a message to a specific queue
await manager.enqueue('user-queue', 'Hello, User!');

// Close a specific queue
manager.close('user-queue');

// Close all queues
manager.closeAll();
```

## API Reference

### `MessageQueue<T>`

A single message queue instance that handles messages of type `T`.

#### Methods

- `enqueue(message: T): Promise<void>`
  - Enqueues a message to the queue
  - Returns a promise that resolves when the message is processed
  - Throws an error if the queue is closed

- `subscribe(handler: (message: T) => Promise<void>): void`
  - Subscribes to messages from the queue
  - The handler function will be called for each message
  - Multiple subscribers can be registered
  - Returns void

- `close(): void`
  - Closes the queue and prevents new messages from being enqueued
  - Existing messages will still be processed
  - Returns void

### `MessageQueueManager<T>`

A manager class that handles multiple named message queues of type `T`.

#### Methods

- `enqueue(queueId: string, message: T): Promise<void>`
  - Enqueues a message to the specified queue
  - Creates the queue if it doesn't exist
  - Returns a promise that resolves when the message is processed
  - Throws an error if the queue is closed

- `subscribe(queueId: string, handler: (message: T) => Promise<void>): void`
  - Subscribes to messages from the specified queue
  - Creates the queue if it doesn't exist
  - Multiple subscribers can be registered per queue
  - Returns void

- `close(queueId: string): void`
  - Closes the specified queue
  - Prevents new messages from being enqueued
  - Existing messages will still be processed
  - Returns void

- `closeAll(): void`
  - Closes all queues managed by this instance
  - Returns void

## Best Practices

1. Always close queues when they are no longer needed to prevent memory leaks
2. Handle errors in your message handlers appropriately
3. Use TypeScript's type system to ensure type safety
4. Consider using the MessageQueueManager when you need multiple independent queues
5. Keep message handlers lightweight and non-blocking
