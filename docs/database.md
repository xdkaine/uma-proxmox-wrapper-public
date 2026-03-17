# Database & Prisma

This document covers the database layer of Uma: schema design, Prisma ORM usage, migrations, backups, and MariaDB configuration.

---

## Overview

Uma stores all application state — users, messages, audit logs, docs, whiteboard data, pool limits, and configuration — in a **MariaDB 11.4** database, accessed through **Prisma ORM**. The schema is defined in `prisma/schema.prisma`.

---

## Database Architecture

```mermaid
graph TD
    subgraph "Uma Application"
        API["API Routes"]
        Socket["Socket.IO Server"]
        Prisma["Prisma Client<br/>(Singleton)"]
    end

    API --> Prisma
    Socket --> Prisma
    Prisma --> DB[("MariaDB 11.4")]

    classDef app fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;
    classDef orm fill:#8b5cf6,stroke:#6d28d9,stroke-width:2px,color:#fff;
    classDef db fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff;

    class API,Socket app;
    class Prisma orm;
    class DB db;
```

Both the Next.js API routes and the Socket.IO server (which runs in a separate CJS context) maintain their own Prisma client instances, both using the singleton pattern to avoid connection pool exhaustion.

---

## Connection Configuration

The database connection is configured via the `DATABASE_URL` environment variable:

```ini
# Local development
DATABASE_URL="mysql://proxmox:password@localhost:3306/proxmox_wrapper"

# Docker Compose (uses internal network)
DATABASE_URL="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@db:3306/${MYSQL_DATABASE}"
```

Prisma is configured in `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

---

## Schema Overview

The schema contains 10 models organized into four functional groups:

### System Configuration

| Model | Description |
|---|---|
| **AppConfig** | Key-value store for application settings. Uses `Json` type for the value field. |
| **Notification** | System-wide notification banners with type (info/warning/error/success), priority ordering, and active/inactive state. |
| **PoolLimit** | Per-pool resource quotas. Each pool can have limits on VMs, LXCs, VNets, CPU cores, memory (MB), and disk (GB). A value of 0 means unlimited. |

### User & Communication

| Model | Description |
|---|---|
| **User** | User profiles synchronized from LDAP on first login. Stores `displayName`, `avatar`, and a flexible `settings` JSON field for preferences (DnD mode, message privacy, online status visibility). |
| **Group** | Chat groups/channels with many-to-many member and admin relations to User. |
| **Message** | Chat messages supporting DMs (sender/receiver) and group messages (sender/group). Features include reply threading, soft delete, edit timestamps, and type-based content (text, image, file). |
| **Reaction** | Emoji reactions on messages. Uniquely constrained to one reaction per emoji per user per message. |
| **Block** | User blocking with unique pair constraint. |

### Content & Collaboration

| Model | Description |
|---|---|
| **Doc** | Admin-published articles with markdown content (`LongText`), optional cover images, visit counters, and pinned/published flags. |
| **WhiteboardState** | Single-row table storing the current collaborative whiteboard canvas as a JSON array of stroke objects. Uses a fixed ID of `"default"`. |

### Audit

| Model | Description |
|---|---|
| **AuditLog** | Comprehensive action log. Indexed on `userId`, `action`, and `createdAt` for efficient querying. The `details` field stores a full JSON snapshot of the action context. |

---

## Prisma Client Singleton

To prevent connection pool exhaustion in development (where Next.js hot-reloads modules), Prisma is instantiated as a singleton:

```typescript
// lib/prisma.ts
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

The Socket.IO server (`lib/socket-server-js.js`) uses the same pattern in its CJS context:

```javascript
const globalForPrisma = globalThis;
const prisma = globalForPrisma.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.__prisma = prisma;
```

---

## Schema Management

### Development: `prisma db push`

During development and on Docker container startup, Uma uses `prisma db push` to synchronize the schema with the database. This command:

- Creates tables that don't exist
- Adds new columns/indexes
- Does **not** run migrations or preserve data on breaking changes

This is the default behavior in the `docker-entrypoint.sh`:

```bash
npx prisma db push --skip-generate
```

### Production: Migrations (Recommended)

For production environments where data preservation on schema changes is critical, switch to Prisma Migrate:

```bash
# Generate a migration from schema changes
npx prisma migrate dev --name descriptive_name

# Apply migrations in production
npx prisma migrate deploy
```

To use migrations in Docker, update `docker-entrypoint.sh`:

```bash
# Replace:
npx prisma db push --skip-generate
# With:
npx prisma migrate deploy
```

---

## Useful Prisma Commands

| Command | Description |
|---|---|
| `npx prisma generate` | Regenerate the Prisma client after schema changes |
| `npx prisma db push` | Push schema to database (no migration files) |
| `npx prisma migrate dev` | Create and apply a new migration |
| `npx prisma migrate deploy` | Apply pending migrations (production) |
| `npx prisma studio` | Open the browser-based database GUI |
| `npx prisma db pull` | Introspect an existing database into the schema |
| `npx prisma format` | Format the schema file |

---

## Indexes

The schema defines the following indexes for query performance:

| Model | Index | Purpose |
|---|---|---|
| AuditLog | `userId` | Filter logs by user |
| AuditLog | `action` | Filter by action type |
| AuditLog | `createdAt` | Time-range queries, pagination |
| Doc | `createdAt` | Chronological listing |
| Message | `senderId` | Query sent messages |
| Message | `receiverId` | Query received messages |
| Message | `groupId` | Query group messages |
| Reaction | `messageId` | Load reactions for a message |

---

## Backup & Restore

### Manual Backup

```bash
# From Docker
docker compose exec db mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" proxmox_wrapper > backup.sql

# Compressed
docker compose exec db mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" proxmox_wrapper | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Restore

```bash
docker compose exec -T db mysql -u root -p"$MYSQL_ROOT_PASSWORD" proxmox_wrapper < backup.sql
```

### Automated Backup Script

```bash
#!/bin/bash
BACKUP_DIR=/backups/uma
mkdir -p "$BACKUP_DIR"
docker compose exec -T db mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" proxmox_wrapper \
  | gzip > "$BACKUP_DIR/uma_$(date +%Y%m%d_%H%M%S).sql.gz"

# Retain last 30 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
```

---

## MariaDB Tuning

For larger deployments, consider tuning MariaDB in `docker-compose.yml`:

```yaml
db:
  image: mariadb:11.4
  command: >
    --innodb-buffer-pool-size=512M
    --max-connections=200
    --character-set-server=utf8mb4
    --collation-server=utf8mb4_unicode_ci
```

The default configuration is sufficient for most small to medium deployments.
