#!/usr/bin/env bash
# Sets up a local indexer: Postgres and Redis run in Docker, the indexer
# runs on the host. Safe to re-run: the seeders skip a seeded database.
set -euo pipefail

cd "$(dirname "$0")/.."

fail() {
  echo "✗ $1" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "Docker is not installed: https://docs.docker.com/get-docker/"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 ('docker compose') is not available"
command -v npm >/dev/null 2>&1 || fail "Node.js and npm are not installed"

if [ -f .env ]; then
  echo "✓ Using existing .env"
else
  cp .env.example .env
  echo "✓ Created .env from .env.example (local devnet defaults)"
fi

echo "→ Starting Postgres and Redis"
docker compose up -d --wait postgres redis

echo "→ Installing dependencies"
npm ci

echo "→ Building"
npm run build

echo "→ Running migrations"
npm run db:migrate

echo "→ Running seeders"
npm run db:seed

cat <<EOF

✓ Setup complete. Start the indexer:
    npm start          # compiled build
    npm run dev        # hot reload

  Check progress:
    docker compose exec postgres psql -U zenon -d nom_indexer -c "select * from indexer.indexer_state"

  Stop Postgres and Redis:
    docker compose down
EOF
