#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../elisha-sports-bot"

# Redis is a local development cache, not durable application storage.
redis-server --bind 127.0.0.1 --port 6379 --save "" --appendonly no &
redis_pid=$!
app_pid=""

cleanup() {
  trap - EXIT INT TERM
  if [[ -n "$app_pid" ]]; then
    kill "$app_pid" 2>/dev/null || true
    wait "$app_pid" 2>/dev/null || true
  fi
  kill "$redis_pid" 2>/dev/null || true
  wait "$redis_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' INT TERM

ready=false
for attempt in {1..50}; do
  kill -0 "$redis_pid"
  if redis-cli -h 127.0.0.1 ping 2>/dev/null | grep -qx PONG; then
    ready=true
    break
  fi
  sleep 0.1
done
if [[ "$ready" != true ]]; then
  echo "Redis did not become ready" >&2
  exit 1
fi

node src/server.js &
app_pid=$!
wait -n "$redis_pid" "$app_pid"
