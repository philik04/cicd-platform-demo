#!/bin/sh
set -e

echo "Running database migrations..."
# Invoke the Prisma CLI directly via node rather than npx/npm - the
# production image has no npm installed (see backend/Dockerfile), and this
# is the only thing in this image that would otherwise need it.
# node_modules/.bin/prisma is the same symlink `npx prisma` would have
# resolved to locally, so this is equivalent, just without npm in the loop.
node node_modules/.bin/prisma migrate deploy

echo "Starting server..."
exec node dist/server.js
