# @ts-drp/validation

The `@ts-drp/validation` package provides centralized, reusable runtime validation schemas for inputs and messages used in the ts-drp project. It uses [Zod](https://zod.dev/) — a TypeScript-first schema validation library — to ensure correctness and safety of incoming data, especially from network messages and user input.

This package helps prevent malformed data (e.g., empty object id when connecting to an object) from propagating through the system.

## Installation

You can install the package using npm or pnpm:

```bash
npm install @ts-drp/validation
```

or

```bash
pnpm add @ts-drp/validation
```