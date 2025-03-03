# DRP Example

This is an example that uses a DRP to implement a 2D grid space where users appear to be circles and can move around the integer grid one grid at a time.

## Specifics

The Grid DRP has a mapping from user id (node id concacenated with a randomly assigned color string) to the user's position on the grid. The DRP leverages the underlying hash graph for conflict-free consistency. The mergeCallback function receives the linearised operations returned from the underlying hash graph, and recomputes the user-position mapping from those operations.

## How to run locally

After cloning the repository, run the following commands:

```bash
cd ts-drp/examples/grid
pnpm i
pnpm dev
```
