# Uma — Proxmox Wrapper

Uma is a modern, full-featured web management interface for [Proxmox Virtual Environment](https://www.proxmox.com/en/proxmox-virtual-environment). Built with **Next.js 16**, **React 19**, and a custom Node.js server, it provides an intuitive dashboard for managing VMs, containers, resource pools, SDN networking, and more — backed by LDAP/AD authentication, real-time chat, a collaborative whiteboard, and comprehensive audit logging.

---

## Table of Contents

- [Key Features](#key-features)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Authentication & Sessions](#authentication--sessions)
- [Access Control (ACL)](#access-control-acl)
- [Real-Time Systems](#real-time-systems)
- [Middleware & Security](#middleware--security)
- [Rate Limiting](#rate-limiting)
- [Audit Logging](#audit-logging)
- [Getting Started](#getting-started)
- [Docker Deployment](#docker-deployment)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Security Best Practices](#security-best-practices)
- [Documentation](#documentation)

---

## Key Features

| Category | Capabilities |
|---|---|
| **VM & Container Management** | Create, clone, start/stop/reboot, resize, delete QEMU VMs and LXC containers |
| **VNC Console** | Browser-based console via WebSocket proxy with TLS tunneling to Proxmox |
| **Resource Pools** | Create and manage pools with per-pool resource quotas (CPU, memory, disk, VM/LXC/VNET limits) |
| **SDN Networking** | Manage SDN zones, VNets, VLAN tags, and apply network configuration |
| **Snapshots & Backups** | Create/rollback/delete snapshots; create vzdump backups with compression |
| **Firewall** | Per-VM firewall rule management |
| **Replication** | Configure and manage storage replication jobs |
| **LDAP/AD Authentication** | Authenticate users against Active Directory or OpenLDAP |
| **Role-Based Access** | Proxmox ACL integration with pool-ownership and group-based permissions |
| **Real-Time Chat** | Socket.IO powered DM and group messaging with reactions, editing, blocking |
| **Collaborative Whiteboard** | Live shared canvas with persistent stroke storage |
| **Documentation System** | Admin-published markdown articles with cover images and visit tracking |
| **Audit Logging** | Every action logged to MariaDB with IP, user-agent, and detailed metadata |
| **Rate Limiting** | Redis-backed (with in-memory fallback) rate limiting on all sensitive operations |
| **Notifications** | System-wide configurable notification banners |
| **Hardware Templates** | Predefined VM hardware configurations for quick provisioning |
| **Modern UI** | Radix UI, Framer Motion, Tailwind CSS, Recharts, dark/light mode |

---

## Architecture

Uma acts as a middleware bridge between end-users and the Proxmox backend, orchestrating authentication, caching, real-time communication, and access control.

```mermaid
graph TD
    Client["Web Browser"] <-->|"HTTP / WebSockets"| Server["Uma Server<br/>(Next.js + Custom Node)"]

    subgraph Uma["Uma Application Stack"]
        Server <-->|"Session / Rate Limits"| Redis[("Redis 7")]
        Server <-->|"ORM / State"| DB[("MariaDB 11.4<br/>(Prisma)")]
        Server <-->|"User Auth"| LDAP["LDAP / AD"]
        Server <-->|"Chat / Whiteboard"| SocketIO["Socket.IO"]
    end

    Server <-->|"REST API (Token Auth)"| Proxmox["Proxmox VE Cluster"]
    Client -.->|"VNC over WSS"| VNCProxy["VNC WebSocket Proxy"]
    VNCProxy -.->|"TLS Tunnel"| Proxmox

    classDef client fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff;
    classDef server fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;
    classDef db fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff;
    classDef proxmox fill:#ef4444,stroke:#b91c1c,stroke-width:2px,color:#fff;
    classDef realtime fill:#8b5cf6,stroke:#6d28d9,stroke-width:2px,color:#fff;

    class Client client;
    class Server,VNCProxy server;
    class Redis,DB,LDAP db;
    class Proxmox proxmox;
    class SocketIO realtime;
```

### Request Flow

```mermaid
sequenceDiagram
    participant Browser
    participant Middleware
    participant API Route
    participant ACL Engine
    participant Proxmox API
    participant Database

    Browser->>Middleware: HTTP Request
    Middleware->>Middleware: Load iron-session (read-only)
    Middleware->>Middleware: Check auth + route protection
    Middleware->>Middleware: Add CSP / security headers
    Middleware->>API Route: Forward (if authorized)
    API Route->>API Route: Rate limit check (Redis/memory)
    API Route->>ACL Engine: Check pool/VM access
    ACL Engine->>Proxmox API: Fetch ACLs + resources
    ACL Engine-->>API Route: Access decision
    API Route->>Proxmox API: Execute action
    Proxmox API-->>API Route: Response
    API Route->>Database: Audit log
    API Route-->>Browser: JSON Response
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router) with custom `server.js` entry point |
| **Runtime** | Node.js 20+ |
| **Language** | TypeScript 5.9, JavaScript (server entry + socket server) |
| **UI** | React 19, Radix UI, Framer Motion, Tailwind CSS, Recharts, Lucide icons |
| **State** | Zustand, SWR |
| **Database** | MariaDB 11.4 via Prisma ORM |
| **Cache** | Redis 7 (ioredis) |
| **Auth** | LDAP/AD (ldapts) + iron-session |
| **Real-Time** | Socket.IO (chat, whiteboard, presence) |
| **VNC** | react-vnc + custom TLS WebSocket proxy |
| **Validation** | Zod, DOMPurify |
| **Forms** | React Hook Form + @hookform/resolvers |
| **Containerization** | Docker (multi-stage), Docker Compose |

---

## Database Schema

Uma uses **Prisma ORM** with a **MySQL/MariaDB** datasource. The schema lives at `prisma/schema.prisma`.

```mermaid
erDiagram
    User ||--o{ Message : "sends"
    User ||--o{ Message : "receives"
    User ||--o{ Reaction : "reacts"
    User ||--o{ Block : "blocks"
    User }o--o{ Group : "member of"
    User }o--o{ Group : "admin of"
    Group ||--o{ Message : "contains"
    Message ||--o{ Reaction : "has"
    Message ||--o{ Message : "replies"

    User {
        string id PK
        string username UK
        string displayName
        string avatar
        json settings
    }

    Group {
        string id PK
        string name
        string avatar
    }

    Message {
        string id PK
        string content
        string senderId FK
        string receiverId FK
        string groupId FK
        boolean read
        boolean delivered
        string type
        json metadata
        string replyToId FK
        datetime editedAt
        datetime deletedAt
    }

    Reaction {
        string id PK
        string emoji
        string userId FK
        string messageId FK
    }

    Block {
        string id PK
        string blockerId FK
        string blockedId FK
    }
```

### All Models

| Model | Purpose | Key Fields |
|---|---|---|
| **AppConfig** | Key-value application configuration store | `key` (unique), `value` (JSON) |
| **Notification** | System-wide alert banners | `message`, `type`, `isActive`, `priority` |
| **AuditLog** | Comprehensive action logging | `username`, `action`, `resource`, `details` (JSON), `ipAddress`, `status` |
| **Doc** | Admin-published articles/threads | `title`, `content` (LongText/Markdown), `coverImage`, `visitedBy`, `pinned` |
| **User** | User profiles and settings | `username` (unique), `displayName`, `avatar`, `settings` (JSON) |
| **Group** | Chat groups/channels | `name`, members/admins (User relations) |
| **Message** | Chat message history | `content`, sender/receiver/group relations, `type`, `replyToId`, soft-delete |
| **Reaction** | Emoji reactions on messages | `emoji`, unique per (user, message, emoji) |
| **Block** | User blocking | `blockerId` → `blockedId`, unique pair |
| **WhiteboardState** | Shared collaborative canvas | `elements` (JSON array of strokes) |
| **PoolLimit** | Resource quotas per pool | `poolId` (unique), `maxVMs`, `maxLXCs`, `maxVnets`, `maxCpu`, `maxMemory`, `maxDisk` |

For more detail on schema design, migrations, and Prisma workflows, see [docs/database.md](./docs/database.md).

---

## API Reference

All API routes live under `app/api/`. Protected routes require an active session; admin routes additionally require `isAdmin`.

### Authentication

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/api/login` | LDAP authentication, session creation | Public |
| POST | `/api/logout` | Destroy session | Authenticated |
| GET | `/api/auth` | Get current session state | Public |
| GET | `/api/user` | Get current user profile | Authenticated |

### Proxmox — Virtual Machines

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/proxmox/vm/[vmid]/status` | VM status (running, stopped, etc.) |
| GET | `/api/proxmox/vm/[vmid]/config` | VM hardware configuration |
| POST | `/api/proxmox/vm/[vmid]/config` | Update VM configuration |
| POST | `/api/proxmox/vm/[vmid]/power` | Power actions (start/stop/reset/shutdown/reboot/suspend/resume) |
| POST | `/api/proxmox/vm/[vmid]/resize` | Resize a VM disk |
| POST | `/api/proxmox/vm/[vmid]/template` | Convert VM to template |
| POST | `/api/proxmox/vm/[vmid]/vnc` | Create VNC ticket for console access |
| DELETE | `/api/proxmox/vm/[vmid]` | Delete VM (with purge) |
| GET | `/api/proxmox/vm/[vmid]/rrddata` | Performance metrics (RRD data) |
| GET | `/api/proxmox/vm/[vmid]/snapshots` | List snapshots |
| POST | `/api/proxmox/vm/[vmid]/snapshots` | Create snapshot |
| POST | `/api/proxmox/vm/[vmid]/snapshots/rollback` | Rollback to snapshot |
| DELETE | `/api/proxmox/vm/[vmid]/snapshots` | Delete snapshot |
| GET | `/api/proxmox/vm/[vmid]/firewall/rules` | List firewall rules |
| POST | `/api/proxmox/vm/[vmid]/firewall/rules` | Add firewall rule |
| DELETE | `/api/proxmox/vm/[vmid]/firewall/rules` | Delete firewall rule |

### Proxmox — Cluster & Nodes

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/proxmox/resources` | All cluster resources |
| GET | `/api/proxmox/nodes/[node]/status` | Node status and metrics |
| GET | `/api/proxmox/nodes/[node]/rrd` | Node RRD performance data |
| GET | `/api/proxmox/nodes/[node]/storage` | Node storage list |
| GET | `/api/proxmox/nodes/[node]/storage/isos` | ISO images on storage |
| GET | `/api/proxmox/nodes/[node]/tasks` | Node task list |
| POST | `/api/proxmox/nodes/[node]/qemu` | Create new VM |
| POST | `/api/proxmox/nodes/[node]/vzdump` | Create backup |
| GET | `/api/proxmox/next-id` | Get next available VMID |
| GET | `/api/proxmox/templates` | List templates |
| POST | `/api/proxmox/clone` | Clone a VM |

### Proxmox — Resource Pools

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/proxmox/pools` | List accessible pools |
| POST | `/api/proxmox/pools` | Create pool |
| GET | `/api/proxmox/pools/[poolId]` | Pool details |
| DELETE | `/api/proxmox/pools/[poolId]` | Delete pool |
| GET/PUT | `/api/proxmox/pools/[poolId]/acl` | Pool ACL management |
| GET/PUT | `/api/proxmox/pools/[poolId]/limits` | Pool resource limits |
| GET/PUT | `/api/proxmox/pools/acl` | Bulk pool ACL operations |

### Proxmox — SDN (Networking)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/proxmox/sdn/zones` | List SDN zones |
| POST | `/api/proxmox/sdn/zones` | Create zone |
| GET | `/api/proxmox/sdn/vnets` | List VNets |
| POST | `/api/proxmox/sdn/vnets` | Create VNet |
| DELETE | `/api/proxmox/sdn/vnets` | Delete VNet |
| GET | `/api/proxmox/sdn/vnets/next-tag` | Get next available VLAN tag |
| PUT | `/api/proxmox/sdn/apply` | Apply SDN configuration |
| GET | `/api/proxmox/sdn/apply-queue` | Check pending SDN tasks |
| GET | `/api/proxmox/sdn/status` | SDN status |

### Proxmox — Access Control

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/proxmox/access/acl` | List all ACLs |
| GET | `/api/proxmox/access/users` | List Proxmox users |
| GET | `/api/proxmox/access/roles` | List available roles |

### Proxmox — Replication & Tasks

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/proxmox/cluster/replication` | List replication jobs |
| POST | `/api/proxmox/cluster/replication` | Create replication job |
| DELETE | `/api/proxmox/cluster/replication/[id]` | Delete replication job |
| GET | `/api/proxmox/tasks/status` | Task status by UPID |
| GET | `/api/proxmox/storage/[storage]/content` | Storage content listing |

### Chat, Admin, & Utilities

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/chat/history` | DM conversation history |
| GET | `/api/chat/recent` | Recent conversations |
| GET | `/api/chat/group` | Group message history |
| GET | `/api/chat/public` | Public channel messages |
| GET/PUT | `/api/settings` | App settings management |
| GET/POST/PUT/DELETE | `/api/notifications` | Notification banners |
| GET/POST/PUT/DELETE | `/api/docs` | Article/doc management |
| GET/POST/PUT/DELETE | `/api/hardware-templates` | Hardware template management |
| GET | `/api/admin/audit-logs` | Audit log viewer |
| POST | `/api/upload` | File upload (images) |
| GET/POST | `/api/groups` | Group management |
| GET/POST | `/api/users` | User search/management |
| GET | `/api/metadata` | Link metadata extraction |

---

## Authentication & Sessions

### Login Flow

```mermaid
sequenceDiagram
    participant User
    participant Uma API
    participant LDAP/AD
    participant Session Store

    User->>Uma API: POST /api/login {username, password}
    Uma API->>Uma API: Rate limit check (5 per 15min)
    Uma API->>Uma API: CSRF token validation
    Uma API->>LDAP/AD: Bind as service account
    LDAP/AD-->>Uma API: Bind success
    Uma API->>LDAP/AD: Search for user DN
    LDAP/AD-->>Uma API: User entry (DN, groups, displayName)
    Uma API->>LDAP/AD: Re-bind as user (verify password)
    LDAP/AD-->>Uma API: Bind success
    Uma API->>Uma API: Check ADMIN_GROUPS membership
    Uma API->>Session Store: Create iron-session cookie
    Uma API->>Uma API: Log audit event
    Uma API-->>User: 200 OK + Set-Cookie
```

### Session Configuration

| Setting | Value | Description |
|---|---|---|
| Cookie Name | `proxmox-wrapper-session` | Encrypted session cookie |
| Encryption | iron-session (AES-256) | Minimum 32-character password required |
| Default TTL | 28,800s (8 hours) | Configurable via `SESSION_TTL` |
| Max TTL (prod) | 43,200s (12 hours) | Enforced at startup |
| Secure Cookie | Required in production | `USE_SECURE_COOKIE` env var |
| SameSite | `lax` | Allows navigation from external sites |
| HttpOnly | `true` | Prevents XSS access |

### Session Data

```typescript
interface SessionData {
    user?: {
        username: string;
        displayName?: string;
        isLoggedIn: boolean;
        dn?: string;           // LDAP Distinguished Name
        groups?: string[];     // LDAP group memberships
        isAdmin?: boolean;     // Derived from ADMIN_GROUPS
    };
    csrfToken?: string;
}
```

For detailed LDAP/AD setup instructions, see [docs/authentication.md](./docs/authentication.md).

---

## Access Control (ACL)

Uma implements a multi-layered permission model bridging LDAP groups with Proxmox ACLs.

### Permission Resolution

```mermaid
flowchart TD
    A["Access Request"] --> B{"Is Admin?"}
    B -->|Yes| Z["Full Access"]
    B -->|No| C{"Pool Ownership?<br/>DEV_username_* or DEV_group_*"}
    C -->|Yes| Z
    C -->|No| D{"Direct VM ACL?<br/>/vms/VMID path"}
    D -->|Yes| E{"Has Action Role?"}
    E -->|Yes| Z
    D -->|No| F{"Pool Membership?<br/>VM belongs to pool"}
    F -->|Yes| G{"Pool ACL?<br/>/pool/POOLID path"}
    G -->|Yes| E
    G -->|No| X["Denied"]
    F -->|No| X
    E -->|No| X
```

### Role Hierarchy

| Role | VM Actions | Pool Management | Pool Access |
|---|---|---|---|
| `Administrator` | Yes | Yes | Yes |
| `PVEAdmin` | Yes | Yes | Yes |
| `PVEVMAdmin` | Yes | No | Yes |
| `PVEVMUser` | Yes | No | Yes |
| `PVEPoolUser` | No | No | Yes |
| `NoAccess` | No | No | No |

### Pool Ownership Convention

Pools follow the naming convention `DEV_<owner>_<number>`:
- **User-owned**: `DEV_jsmith_1` — user `jsmith` has full manage rights
- **Group-owned**: `DEV_DevTeam_1` — all members of `DevTeam` group have manage rights
- Group names support LDAP CN extraction and realm suffix mapping (`DevTeam-SDC`)

For more detail on ACL configuration and group mapping, see [docs/access-control.md](./docs/access-control.md).

---

## Real-Time Systems

### Socket.IO (Chat & Whiteboard)

Uma runs a Socket.IO server on path `/api/socket/io` with session-based authentication middleware.

**Chat Events:**

| Event | Direction | Description |
|---|---|---|
| `send_message` | Client to Server | Send DM or group message (Zod validated, DOMPurify sanitized) |
| `new_message` | Server to Client | New message broadcast |
| `edit_message` | Client to Server | Edit own message |
| `message_updated` | Server to Client | Edited message broadcast |
| `delete_message` | Client to Server | Soft-delete own message |
| `message_deleted` | Server to Client | Deletion broadcast |
| `add_reaction` | Client to Server | Add emoji reaction |
| `typing` | Client to Server | Typing indicator |
| `mark_read` | Client to Server | Mark messages as read |
| `join_group` | Client to Server | Join a group chat room |
| `presence` | Server to Client | User online/offline status |

**Whiteboard Events:**

| Event | Direction | Description |
|---|---|---|
| `draw_stroke` | Bidirectional | Real-time stroke broadcast (max 16KB per stroke) |
| `draw_save` | Client to Server | Persist stroke history to DB (admin only, max 10MB) |
| `draw_clear` | Client to Server | Clear canvas for all users (admin only) |

All socket events have per-event rate limiting and payload size enforcement.

### VNC WebSocket Proxy

The custom `server.js` handles VNC WebSocket upgrades at `/api/proxy/vnc`:

1. **Authenticate** — Validates iron-session from the upgrade request
2. **Authorize** — Checks VM access via ACL engine
3. **Validate Origin** — Enforces origin allowlist or host match
4. **TLS Tunnel** — Opens a raw TLS socket to Proxmox and performs the WebSocket handshake
5. **Bidirectional Pipe** — Pipes data between client and Proxmox sockets

```
Browser <-> [WSS] <-> Uma server.js <-> [TLS] <-> Proxmox VNC
```

For more detail on VNC proxy configuration and troubleshooting, see [docs/realtime.md](./docs/realtime.md).

---

## Middleware & Security

The Next.js middleware (`middleware.ts`) runs on every request and provides:

### Route Protection

| Route Pattern | Protection Level |
|---|---|
| `/dashboard/**`, `/api/proxmox/**` | Authenticated |
| `/admin/**`, `/api/admin/**`, `/api/settings/**` | Admin only |
| `/login` | Redirects to dashboard if already authenticated |
| Everything else | Public |

### Security Headers

| Header | Value |
|---|---|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Permissions-Policy` | camera, microphone, geolocation, browsing-topics all disabled |
| `Content-Security-Policy` | Nonce-based script-src, restricted connect-src, frame-ancestors none |

---

## Rate Limiting

Rate limiting uses **Redis** for persistence across restarts with automatic **in-memory fallback** if Redis is unavailable.

| Operation | Window | Max Attempts |
|---|---|---|
| Login | 15 min | 5 |
| VM Create | 1 hour | 20 |
| VM Delete | 1 hour | 20 |
| VM Power Action | 1 min | 30 |
| VM Clone | 1 hour | 10 |
| VM Config Update | 1 min | 30 |
| VM Snapshot | 1 min | 10 |
| Pool Create | 1 hour | 30 |
| ACL Modify | 1 min | 50 |
| VNet Create | 1 hour | 50 |
| Search | 1 min | 60 |
| Upload | 1 hour | 50 |

Socket.IO events have separate per-connection rate limits (e.g., 40 messages/min, 1000 draw strokes/10s).

---

## Audit Logging

Every significant action is logged to the `AuditLog` table in MariaDB with:

- **Who**: `userId`, `username`
- **What**: `action` (e.g., `VM_START`, `LOGIN`, `POOL_CREATE`)
- **Where**: `resource` (e.g., `vm-100`, `pool/DEV_admin_1`)
- **Details**: Full JSON metadata (changes snapshot, parameters, etc.)
- **Context**: `ipAddress`, `userAgent`
- **Result**: `status` (SUCCESS / FAILURE / WARNING)

There are **80+ defined audit actions** covering authentication, VM lifecycle, chat, whiteboard, pools, SDN, firewall, replication, docs, settings, and more.

Audit logging is fire-and-forget — failures never block the primary operation.

---

## Getting Started

### Prerequisites

- **Node.js** 20+
- **MariaDB** or MySQL
- **Redis** (optional in development — set `DISABLE_REDIS=true`)
- **Proxmox VE** with an API token
- **LDAP/AD Server** for authentication

### Local Development

1. **Clone and install:**
   ```bash
   git clone https://github.com/your-org/proxmox-wrapper.git
   cd proxmox-wrapper
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your credentials
   ```

3. **Generate Prisma client and push schema:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3004](http://localhost:3004) in your browser.

### Useful Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (with Socket.IO + VNC proxy) |
| `npm run build` | Build production bundle |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npx prisma studio` | Open Prisma database GUI |
| `node scripts/generate-secrets.js` | Generate secure cookie password |
| `npx ts-node scripts/check-realms.ts` | Check Proxmox authentication realms |
| `npx ts-node scripts/init-templates.ts` | Initialize hardware templates |

For full deployment instructions, see [docs/deployment.md](./docs/deployment.md).

---

## Docker Deployment

### Architecture

```mermaid
graph LR
    subgraph Docker Compose
        App["proxmox-wrapper<br/>:3003"]
        DB["MariaDB 11.4<br/>(proxmox-db)"]
        Cache["Redis 7<br/>(proxmox-redis)"]
    end

    App <--> DB
    App <--> Cache
    App <-->|REST API| PVE["Proxmox VE"]

    classDef app fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;
    classDef db fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff;
    classDef ext fill:#ef4444,stroke:#b91c1c,stroke-width:2px,color:#fff;

    class App app;
    class DB,Cache db;
    class PVE ext;
```

### Quick Start

```bash
# Configure your environment
cp .env.example .env.local

# Build and start all services
docker compose up -d --build

# View logs
docker compose logs -f app
```

### Services

| Service | Image | Port | Description |
|---|---|---|---|
| `app` | Custom (multi-stage build) | 3003 | Next.js app + Socket.IO + VNC proxy |
| `db` | `mariadb:11.4` | Internal only | Persistent data (volume: `db_data`) |
| `redis` | `redis:7-alpine` | Internal only | Rate limiting + session cache (256MB, LRU eviction) |

The Dockerfile uses a multi-stage build (deps, builder, runner) with:
- Non-root user (`nextjs:nodejs`)
- Automatic `prisma db push` on startup via `docker-entrypoint.sh`
- Volume mount for uploaded files (`public/uploads`)

For production hardening, reverse proxy setup, and SSL termination, see [docs/deployment.md](./docs/deployment.md).

---

## Environment Variables

### Required

| Variable | Description | Example |
|---|---|---|
| `PROXMOX_URL` | Proxmox API URL | `https://192.168.1.10:8006` |
| `PROXMOX_TOKEN_ID` | API token ID | `root@pam!proxmox-wrapper` |
| `PROXMOX_TOKEN_SECRET` | API token secret | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `SECRET_COOKIE_PASSWORD` | Session encryption key (min 32 chars) | Use `node scripts/generate-secrets.js` |
| `LDAP_URL` | LDAP/AD server URL | `ldap://dc.example.com:389` |
| `LDAP_BIND_DN` | Service account DN | `cn=svc,dc=example,dc=com` |
| `LDAP_BIND_PASSWORD` | Service account password | |
| `LDAP_BASE_DN` | User search base | `dc=example,dc=com` |
| `DATABASE_URL` | Prisma connection string | `mysql://user:pass@localhost:3306/db` |
| `MYSQL_ROOT_PASSWORD` | MariaDB root password (Docker) | |
| `MYSQL_DATABASE` | Database name | `proxmox_wrapper` |
| `MYSQL_USER` | Database user | `proxmox` |
| `MYSQL_PASSWORD` | Database password | |

### Optional

| Variable | Default | Description |
|---|---|---|
| `PROXMOX_SSL_INSECURE` | `false` | Skip TLS verification for self-signed certs |
| `PROXMOX_USER_REALM` | — | Realm suffix for ACL matching (e.g., `SDC`) |
| `LDAP_USER_SEARCH_FILTER` | `(sAMAccountName={{username}})` | LDAP search filter |
| `LDAP_SEARCH_ATTRIBUTES` | `sAMAccountName,cn` | Attributes to retrieve |
| `LDAP_ALLOW_INSECURE_TLS` | `false` | Allow insecure LDAPS connections |
| `SESSION_TTL` | `28800` | Session lifetime in seconds |
| `USE_SECURE_COOKIE` | `true` | Require HTTPS for cookies |
| `ADMIN_GROUPS` | — | Comma-separated admin group names |
| `DISABLE_REDIS` | `false` | Disable Redis (use in-memory fallback) |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string |
| `REDIS_PASSWORD` | — | Redis password |
| `APP_ORIGIN` | — | Allowed origin for CORS/WebSocket |
| `ALLOWED_WS_ORIGINS` | — | Comma-separated allowed WebSocket origins |
| `ALLOW_MISSING_WS_ORIGIN` | `false` | Allow WebSocket without Origin header |
| `RATE_LIMIT_TRUST_PROXY` | `false` | Trust X-Forwarded-For for rate limiting |
| `PORT` | `3004` | Server port |

For a full breakdown of every variable and its interaction with the system, see [docs/environment.md](./docs/environment.md).

---

## Project Structure

```
proxmox-wrapper/
├── app/                        # Next.js App Router
│   ├── api/                    # API routes (50+ endpoints)
│   │   ├── admin/              # Admin-only endpoints (audit logs, stats)
│   │   ├── auth/               # Session status
│   │   ├── chat/               # Chat history, recent, group, public
│   │   ├── docs/               # Article CRUD
│   │   ├── hardware-templates/ # HW template management
│   │   ├── login/              # LDAP authentication
│   │   ├── logout/             # Session destruction
│   │   ├── notifications/      # System notifications
│   │   ├── proxmox/            # Proxmox API proxy (40+ sub-routes)
│   │   ├── settings/           # App settings
│   │   ├── upload/             # File uploads
│   │   └── whiteboard/         # Whiteboard state
│   ├── dashboard/              # Dashboard pages
│   │   ├── pools/              # Resource pool views
│   │   └── vm/                 # VM detail views
│   ├── docs/                   # Documentation pages
│   ├── admin/                  # Admin panel pages
│   └── login/                  # Login page
├── components/                 # React components
│   ├── acl/                    # ACL management UI
│   ├── admin/                  # Admin panel components
│   ├── chat/                   # Chat interface
│   ├── dashboard/              # Dashboard widgets & cards
│   ├── docs/                   # Article viewer/editor
│   ├── pools/                  # Pool management
│   ├── sdn/                    # SDN/VNet management
│   ├── vm/                     # VM controls, console, hardware
│   ├── whiteboard/             # Collaborative canvas
│   └── ui/                     # Shared UI primitives (Radix-based)
├── lib/                        # Core libraries
│   ├── acl.ts                  # Access control engine
│   ├── audit.ts                # Audit logging service
│   ├── config.ts               # App configuration
│   ├── csrf.ts                 # CSRF protection
│   ├── ldap.ts                 # LDAP/AD service
│   ├── limits.ts               # Resource limit enforcement
│   ├── logger.ts               # Structured logger
│   ├── prisma.ts               # Prisma client singleton
│   ├── proxmox-api.ts          # Proxmox REST client (40+ methods)
│   ├── rate-limit.ts           # Rate limiting (Redis + memory)
│   ├── redis.ts                # Redis client with reconnection
│   ├── session.ts              # iron-session configuration
│   ├── socket-server-js.js     # Socket.IO server (chat + whiteboard)
│   └── swr-hooks.ts            # SWR data fetching hooks
├── store/                      # Zustand stores
│   └── chat-store.ts           # Chat state management
├── prisma/
│   └── schema.prisma           # Database schema (10 models)
├── scripts/                    # Utility scripts
├── server.js                   # Custom Node.js server (VNC proxy + Socket.IO)
├── middleware.ts                # Auth + security middleware
├── Dockerfile                  # Multi-stage production build
├── docker-compose.yml          # Full stack orchestration
└── docker-entrypoint.sh        # DB migration on startup
```

---

## Security Best Practices

### Secrets Management

> **Important:** Never commit `.env.local` to version control.

**Docker Secrets (Recommended):**
```yaml
services:
  proxmox-wrapper:
    secrets:
      - proxmox_token_secret
      - ldap_bind_password
      - cookie_password

secrets:
  proxmox_token_secret:
    file: ./secrets/proxmox_token.txt
```

**Cloud Secrets Managers:** AWS Secrets Manager, Azure Key Vault, HashiCorp Vault, Kubernetes Secrets

### Credential Rotation

| Credential | Rotation Period |
|---|---|
| Proxmox API Token | Every 90 days |
| Session Cookie Secret | Every 6 months |
| LDAP Service Account | Per AD/LDAP policy |

### Production Checklist

- [ ] All secrets in environment variables (not hardcoded)
- [ ] `.env.local` in `.gitignore` and never committed
- [ ] Strong cookie secret (min 32 characters, random)
- [ ] TLS enabled for LDAP (`ldaps://`)
- [ ] Valid TLS certificates (no self-signed in production)
- [ ] `NODE_ENV=production`
- [ ] `USE_SECURE_COOKIE=true`
- [ ] `PROXMOX_SSL_INSECURE=false`
- [ ] Rate limiting enabled with Redis
- [ ] Security headers verified
- [ ] Regular dependency updates scheduled

---

## Documentation

For detailed workflow guides, architecture deep-dives, and deployment strategies, see the [`docs/`](./docs/) directory:

| Document | Description |
|---|---|
| [Deployment Guide](./docs/deployment.md) | Docker production setup, reverse proxy, SSL, scaling |
| [Authentication](./docs/authentication.md) | LDAP/AD configuration, session management, admin groups |
| [Database](./docs/database.md) | Prisma schema design, migrations, backups, MariaDB tuning |
| [Access Control](./docs/access-control.md) | ACL engine internals, group mapping, pool ownership |
| [Real-Time Systems](./docs/realtime.md) | Socket.IO chat/whiteboard, VNC proxy, WebSocket troubleshooting |
| [Environment Reference](./docs/environment.md) | Complete variable catalogue with interactions and examples |
