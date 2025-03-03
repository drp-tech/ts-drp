<div align="center">
  <img src="https://avatars.githubusercontent.com/u/157637200" height="128">
  <br />
  <h1>The TypeScript implementation of Distributed Real-Time Programs (DRPs)</h1>
</div>

<div align="center">

![Version](https://img.shields.io/github/package-json/v/drp-tech/ts-topology)
[![Docs](https://img.shields.io/badge/docs-page-blue)](https://drp-tech.github.io/ts-topology/)
[![License](https://img.shields.io/badge/license-MIT-green)](https://github.com/drp-tech/ts-topology/blob/main/LICENSE)
[![Issues](https://img.shields.io/badge/issues-report-red)](https://github.com/drp-tech/ts-topology/issues)
[![Pull Requests](https://img.shields.io/badge/pull_requests-open-orange)](https://github.com/drp-tech/ts-topology/pulls)

[![Website](https://img.shields.io/badge/Website-866678)](https://topology.gg)
[![GitHub](https://img.shields.io/badge/GitHub-ffffff)](https://github.com/drp-tech)
[![X](https://img.shields.io/badge/X-000000)](https://x.com/topology_gg)
[![Telegram](https://img.shields.io/badge/Telegram-24A1DE)](https://t.me/topologyfrens)
[![Discord](https://img.shields.io/badge/Discord-7289da)](https://discord.gg/GUDGzBP5mn)

</div>

# Overview

This is the official TypeScript implementation of Distributed Real-Time Programs (DRP). DRP is a local-first decentralized protocol for real-time applications. It is built on top of libp2p and with a similar design with CRDTs.

# Specifications

The specifications of DRP are shared across different client implementations and can be found in the [specs repository](https://github.com/drp-tech/specs). Currently the specifications are starting to be written based on this implementation.

# Packages

This repository is a monorepo that contains the following packages:

| Package    | Description                                     |
| ---------- | ----------------------------------------------- |
| blueprints | Blueprints of some DRPs that can be freely used |
| logger     | Logger for the whole project                    |
| network    | Network middleware to abstract libp2p           |
| node       | Node for interacting with DRPs library and CLI  |
| object     | DRP objects structure implementation            |

# Examples

All the examples are located in the `examples` directory.

# Usage

This workspace has all packages and examples linked together, so you can run the following commands to start the development:

```bash
# pnpm
pnpm install
```

The postinstall script will build all the packages. In case you have errors, please manually build every package inside the folder `packages`.

# Known Issues

- Peers won't be able to connect with each other if either one of them is behind a VPN.
