#!/bin/sh

set -eu

echo "Checking Caddy homepage..."
curl -fsS http://localhost:8080/ >/dev/null

echo "Checking Orqforge API health..."
curl -fsS http://localhost:8080/api/health

echo "Smoke test passed."
