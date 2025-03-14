# Topology Protocol Collision Example

This is an example that uses Topology Protocol to implement a 2D grid space where users appear to be circles and can move around the integer grid one grid at a time. We additionally implement collision logic into this example so that no 2 circles can be on one grid at a time.

## Specifics

The Grid CRO has a mapping from user id (node id concacenated with a randomly assigned color string) to the user's position on the grid. The CRO leverages the underlying hash graph for conflict-free consistency. The mergeCallback function receives the linearised operations returned from the underlying hash graph, and recomputes the user-position mapping from those operations.

The `resolveConflict` function is additionally used to implement compensation techniques in order to ensure no 2 node can be on the same circle at a time.

## How to run locally

After cloning the repository, run the following commands:

```bash
cd ts-topology/examples/grid-collision
pnpm dev
```
