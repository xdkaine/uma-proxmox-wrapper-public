#!/bin/sh
set -e

echo "Starting database setup..."

# Wait for the database to be ready by retrying prisma db push
echo "Waiting for database and running schema sync..."
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if npx prisma db push --skip-generate 2>&1; then
        echo "Database schema sync successful!"
        break
    fi
    
    attempt=$((attempt + 1))
    echo "Database not ready yet, retrying... (attempt $attempt/$max_attempts)"
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo "Error: Database setup timed out after $max_attempts attempts"
    exit 1
fi

echo "Database setup complete!"

# Fix permissions for public uploads (in case volume mount overwrote them)
echo "Fixing permissions for /app/public..."
chown -R nextjs:nodejs /app/public

# Start the application as nextjs user
echo "Starting the application..."
exec su-exec nextjs:nodejs node server.js
