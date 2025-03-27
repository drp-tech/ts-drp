# GooseWorld - DRP Example

A multiplayer 3D game where players control silly geese in a blocky world. Built with ts-drp and Three.js.

## Features

- Multiplayer support using DRP (Distributed Real-time Protocol)
- 3D graphics with Three.js
- Physics-based movement
- Infinite jumping
- Background music
- Third-person camera

## Controls

- WASD: Move
- Space: Jump
- Mouse: Look around (coming soon)

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run start
```

## Network

The game uses DRP for real-time state synchronization between players. Players can either create a new world or join an existing one by providing the world ID.
