#!/usr/bin/env bash
set -ex

echo "[1/3] prisma contract emit"
npx prisma contract emit

echo "[2/3] prisma db update"
npx prisma db update --db "$DATABASE_URL"

echo "[3/3] npm run start"
exec npm run start
