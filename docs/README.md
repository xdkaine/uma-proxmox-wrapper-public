# Uma Documentation

This directory contains detailed guides for deploying, configuring, and maintaining **Uma — Proxmox Wrapper**. The top-level [README.md](../README.md) provides a high-level overview; the documents here cover the specifics.

## Contents

| Document | Description |
|---|---|
| [Deployment Guide](./deployment.md) | Docker production setup, multi-stage build, reverse proxy, SSL termination, scaling |
| [Authentication](./authentication.md) | LDAP/AD configuration, session management, admin group mapping |
| [Database](./database.md) | Prisma schema, migrations, backups, MariaDB tuning |
| [Access Control](./access-control.md) | ACL engine internals, permission resolution, pool ownership, group mapping |
| [Real-Time Systems](./realtime.md) | Socket.IO chat and whiteboard, VNC proxy, WebSocket troubleshooting |
| [Environment Reference](./environment.md) | Complete variable catalogue with interactions and examples |

## Conventions

- All documents use standard Markdown with Mermaid diagrams where applicable.
- Configuration examples use `.env.local` syntax unless otherwise noted.
- Shell commands assume a Linux/macOS environment; adapt paths for Windows as needed.
