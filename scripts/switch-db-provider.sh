#!/bin/bash
# Switches Prisma provider between sqlite and postgresql based on DATABASE_URL.
# On Vercel (DATABASE_URL=postgresql://...), switches to postgresql.
# Locally (DATABASE_URL=file:...), keeps sqlite.
if echo "$DATABASE_URL" | grep -q "^postgresql\|^postgres:"; then
  echo "[DB] Detected PostgreSQL — switching Prisma provider to postgresql"
  sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
else
  echo "[DB] Using SQLite (local dev)"
fi
