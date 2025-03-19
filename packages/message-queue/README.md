# Channel-Based Message Queue

A lightweight, in-memory channel-based message queue implementation for efficient message passing and processing.

## Features

- Channel-based message passing
- Non-blocking publish/subscribe pattern
- Type-safe message handling
- In-memory message storage
- Async/await support

## Installation

```bash
npm install @ts-drp/message-queue
```

## Usage

```typescript
import { MessageQueue } from '@ts-drp/message-queue';

// Create a new message queue
const queue = new MessageQueue<string>();

// Publish messages
await queue.publish('Hello, World!');

// Subscribe to messages
queue.subscribe(async (message) => {
  console.log('Received:', message);
});
```

## API

### `MessageQueue<T>`

- `publish(message: T): Promise<void>` - Publishes a message to the queue
- `subscribe(handler: (message: T) => Promise<void>): void` - Subscribes to messages
- `unsubscribe(handler: (message: T) => Promise<void>): void` - Unsubscribes from messages

## License

MIT
