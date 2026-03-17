FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
  --mount=type=cache,target=/root/.npm \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; fi


# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1

# Generate Prisma Client
RUN npx prisma generate

RUN \
  --mount=type=cache,target=/app/.next/cache \
  if [ -f yarn.lock ]; then yarn run build; \
  elif [ -f package-lock.json ]; then npm run build; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; \
  else echo "Lockfile not found." && exit 1; fi

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

# Don't run as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Install su-exec for user switching
RUN apk add --no-cache su-exec dos2unix

# Copy public folder
COPY --from=builder /app/public ./public

# Fix permissions for uploads directory
RUN mkdir -p ./public/uploads && chown -R nextjs:nodejs ./public

# Copy built application and dependencies
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy our custom server.js
COPY --from=builder /app/server.js ./server.js

# Copy lib directory (vital for socket-server-js and other runtime libs)
COPY --from=builder /app/lib ./lib

# Copy prisma directory for runtime migrations
COPY --from=builder /app/prisma ./prisma

# Copy entrypoint script and ensure it's executable
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN dos2unix ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh

# User context is now handled in entrypoint (starting as root to fix perms)
# USER nextjs

EXPOSE 3003

ENV PORT=3003

# Use entrypoint script to handle database setup before starting the app
# The entrypoint runs 'prisma db push' to create tables if they don't exist
CMD ["sh", "docker-entrypoint.sh"]
