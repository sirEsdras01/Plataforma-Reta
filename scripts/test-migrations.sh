#!/usr/bin/env bash
# Aplica las migraciones sobre un Postgres local (con pgvector) usando un stub de
# auth/storage de Supabase y ejecuta las pruebas de RLS e integridad.
# Uso: PGURL=postgres://postgres@localhost:5432 ./scripts/test-migrations.sh
set -euo pipefail
PGURL="${PGURL:-postgres://postgres@localhost:5432}"
DB="eduhack_migration_test_$$"
psql "$PGURL/postgres" -qc "create database $DB"
trap 'psql "$PGURL/postgres" -qc "drop database if exists $DB"' EXIT
psql "$PGURL/$DB" -v ON_ERROR_STOP=1 -q -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do psql "$PGURL/$DB" -v ON_ERROR_STOP=1 -q -f "$f"; done
OUT=$(psql "$PGURL/$DB" -v ON_ERROR_STOP=1 -At -f supabase/tests/rls_test.sql)
echo "$OUT"
if echo "$OUT" | grep -qx "f"; then echo "RLS/integrity assertion failed"; exit 1; fi
echo "migrations + RLS tests OK"
