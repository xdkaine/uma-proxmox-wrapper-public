# Environment Variable Reference

This document provides a complete catalogue of every environment variable used by Uma, organized by system. Each variable includes its default value, whether it is required, and notes on how it interacts with other parts of the system.

---

## Proxmox API

| Variable | Required | Default | Description |
|---|---|---|---|
| `PROXMOX_URL` | Yes | — | Base URL of the Proxmox API, including port. Example: `https://192.168.1.10:8006` |
| `PROXMOX_TOKEN_ID` | Yes | — | API token identifier. Format: `user@realm!tokenname`. Example: `root@pam!proxmox-wrapper` |
| `PROXMOX_TOKEN_SECRET` | Yes | — | API token secret (UUID format). Created in Proxmox under Datacenter > Permissions > API Tokens |
| `PROXMOX_USER_REALM` | No | — | Realm suffix appended to usernames and group names when matching Proxmox ACLs. Example: `SDC`. If your LDAP domain is configured in Proxmox as realm `SDC`, and a group `DevTeam` exists, ACLs may reference `DevTeam-SDC` |
| `PROXMOX_SSL_INSECURE` | No | `false` | Skip TLS certificate verification for the Proxmox API. Set to `true` only for self-signed certificates in development. **Do not use `true` in production.** Uses a per-request HTTPS agent rather than the global `NODE_TLS_REJECT_UNAUTHORIZED` flag |

### API Token Setup

1. In Proxmox, go to **Datacenter > Permissions > API Tokens**
2. Create a token for the appropriate user (commonly `root@pam`)
3. Uncheck **Privilege Separation** if the token should inherit all user privileges
4. Copy the Token ID and Secret into `PROXMOX_TOKEN_ID` and `PROXMOX_TOKEN_SECRET`

---

## LDAP / Active Directory

| Variable | Required | Default | Description |
|---|---|---|---|
| `LDAP_URL` | Yes | `ldap://localhost:389` | LDAP server URL. Use `ldaps://` for TLS |
| `LDAP_BIND_DN` | Yes | — | Distinguished Name of the service account used to search for users |
| `LDAP_BIND_PASSWORD` | Yes | — | Password for the service account |
| `LDAP_BASE_DN` | Yes | — | Base DN for user searches. Example: `DC=corp,DC=example,DC=com` |
| `LDAP_USER_SEARCH_FILTER` | No | `(sAMAccountName={{username}})` | LDAP search filter template. `{{username}}` is replaced with the LDAP-escaped login input. For OpenLDAP, use `(uid={{username}})` |
| `LDAP_SEARCH_ATTRIBUTES` | No | `sAMAccountName,cn,memberOf,mail,displayName` | Comma-separated list of attributes to retrieve during user search |
| `LDAP_GROUPS_BASE_DN` | No | Same as `LDAP_BASE_DN` | Separate base DN for group searches (used by admin group search feature) |
| `LDAP_ALLOW_INSECURE_TLS` | No | `false` | Skip TLS certificate validation for LDAPS connections. For testing only |

### Interaction Notes

- The `LDAP_USER_SEARCH_FILTER` determines which LDAP attribute maps to the login username field
- `memberOf` groups extracted during authentication are used for admin determination and ACL group matching
- Group CNs are automatically extracted from full DNs (e.g., `CN=DevTeam,OU=Groups,DC=...` → `DevTeam`)

---

## Session & Cookies

| Variable | Required | Default | Description |
|---|---|---|---|
| `SECRET_COOKIE_PASSWORD` | Yes | — | Encryption key for iron-session cookies. Must be at least 32 characters. Generate with `node scripts/generate-secrets.js` |
| `SESSION_TTL` | No | `28800` | Session lifetime in seconds (default: 8 hours). Set to 0 for no expiration (development only). Maximum 43,200 in production |
| `USE_SECURE_COOKIE` | No | `true` | Require HTTPS for session cookies. Must be `true` in production. Set to `false` for local development over HTTP |
| `COOKIE_DOMAIN` | No | Auto-detected | Explicitly set the cookie domain. Useful for cross-subdomain setups. Leave unset for automatic detection |

### Startup Validation

The application refuses to start if:
- `SECRET_COOKIE_PASSWORD` is missing or shorter than 32 characters
- `SESSION_TTL` is 0 in production
- `SESSION_TTL` exceeds 43,200 in production
- `USE_SECURE_COOKIE` is `false` in production

---

## Database

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Prisma connection string. Format: `mysql://user:password@host:port/database` |
| `MYSQL_ROOT_PASSWORD` | Docker | — | MariaDB root password (used by the `db` Docker service) |
| `MYSQL_DATABASE` | Docker | — | Database name to create (used by Docker service) |
| `MYSQL_USER` | Docker | — | Database user to create (used by Docker service) |
| `MYSQL_PASSWORD` | Docker | — | Database user password (used by Docker service) |

### Docker Compose Notes

In Docker Compose, the `DATABASE_URL` is constructed from the MySQL variables:

```ini
DATABASE_URL=mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@db:3306/${MYSQL_DATABASE}
```

The `db` hostname resolves within the `proxmox-net` Docker network.

---

## Redis

| Variable | Required | Default | Description |
|---|---|---|---|
| `REDIS_URL` | No | `redis://redis:6379` | Redis connection string. Format: `redis://:password@host:port` |
| `REDIS_PASSWORD` | Docker | `changeme_redis_password` | Redis password (used by Docker service and injected into `REDIS_URL`) |
| `DISABLE_REDIS` | No | `false` | Skip Redis entirely and use in-memory rate limiting. Useful for local development without Redis |

### Behavior Without Redis

When Redis is unavailable or disabled:
- Rate limiting falls back to an in-memory store (not persistent across restarts)
- The application logs a warning but continues to function
- In-memory entries are cleaned up every 5 minutes

---

## Admin & Authorization

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADMIN_GROUPS` | No | — | Comma-separated list of LDAP group names that grant admin access. Example: `"Domain Admins,IT-Administrators"`. Matched against the CN extracted from `memberOf` values |

---

## WebSocket & CORS

| Variable | Required | Default | Description |
|---|---|---|---|
| `APP_ORIGIN` | No | `false` (no CORS) | Allowed origin for Socket.IO CORS and WebSocket validation. Example: `https://uma.example.com` |
| `ALLOWED_WS_ORIGINS` | No | — | Comma-separated list of allowed WebSocket origins for VNC proxy. Takes precedence over `APP_ORIGIN` for VNC origin checks |
| `ALLOW_MISSING_WS_ORIGIN` | No | `false` | Allow VNC WebSocket connections without an Origin header. Development only |

### Interaction Notes

- `APP_ORIGIN` affects both Socket.IO CORS and VNC origin validation
- If `ALLOWED_WS_ORIGINS` is set, it is used exclusively for VNC origin checks
- If neither is set and `ALLOW_MISSING_WS_ORIGIN` is false, VNC validates that the Origin matches the request Host header

---

## Rate Limiting

| Variable | Required | Default | Description |
|---|---|---|---|
| `RATE_LIMIT_TRUST_PROXY` | No | `false` | Use `X-Forwarded-For` and `X-Real-IP` headers to determine client IP for rate limiting. Enable when behind a reverse proxy |
| `RATE_LIMIT_TRUSTED_PROXIES` | No | `127.0.0.1,::1` | Comma-separated list of trusted proxy IPs. Only consulted when `RATE_LIMIT_TRUST_PROXY` is `true`. If the request source IP is not in this list, forwarded headers are ignored |

### Important

If `RATE_LIMIT_TRUST_PROXY` is enabled but the request does not originate from a trusted proxy IP, forwarded headers are deliberately ignored to prevent IP spoofing.

---

## Security

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | Set to `production` for production deployments. Affects session validation, cookie security, logging verbosity, and Prisma client behavior |

---

## Server

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3004` | HTTP server port. Docker Compose overrides this to `3003` |
| `HOSTNAME` | No | `localhost` | Hostname the server binds to |

---

## Summary Table

| Variable | System | Required |
|---|---|---|
| `PROXMOX_URL` | Proxmox | Yes |
| `PROXMOX_TOKEN_ID` | Proxmox | Yes |
| `PROXMOX_TOKEN_SECRET` | Proxmox | Yes |
| `PROXMOX_USER_REALM` | Proxmox / ACL | No |
| `PROXMOX_SSL_INSECURE` | Proxmox | No |
| `LDAP_URL` | Auth | Yes |
| `LDAP_BIND_DN` | Auth | Yes |
| `LDAP_BIND_PASSWORD` | Auth | Yes |
| `LDAP_BASE_DN` | Auth | Yes |
| `LDAP_USER_SEARCH_FILTER` | Auth | No |
| `LDAP_SEARCH_ATTRIBUTES` | Auth | No |
| `LDAP_GROUPS_BASE_DN` | Auth | No |
| `LDAP_ALLOW_INSECURE_TLS` | Auth | No |
| `SECRET_COOKIE_PASSWORD` | Session | Yes |
| `SESSION_TTL` | Session | No |
| `USE_SECURE_COOKIE` | Session | No |
| `COOKIE_DOMAIN` | Session | No |
| `DATABASE_URL` | Database | Yes |
| `MYSQL_ROOT_PASSWORD` | Database (Docker) | Docker only |
| `MYSQL_DATABASE` | Database (Docker) | Docker only |
| `MYSQL_USER` | Database (Docker) | Docker only |
| `MYSQL_PASSWORD` | Database (Docker) | Docker only |
| `REDIS_URL` | Redis | No |
| `REDIS_PASSWORD` | Redis (Docker) | Docker only |
| `DISABLE_REDIS` | Redis | No |
| `ADMIN_GROUPS` | Auth / ACL | No |
| `APP_ORIGIN` | WebSocket / CORS | No |
| `ALLOWED_WS_ORIGINS` | VNC Proxy | No |
| `ALLOW_MISSING_WS_ORIGIN` | VNC Proxy | No |
| `RATE_LIMIT_TRUST_PROXY` | Rate Limiting | No |
| `RATE_LIMIT_TRUSTED_PROXIES` | Rate Limiting | No |
| `NODE_ENV` | System | No |
| `PORT` | Server | No |
| `HOSTNAME` | Server | No |
