#!/usr/bin/env bash
set -euo pipefail

redis_pid=
app_pid=

cleanup() {
  if [[ -n "${app_pid}" ]] && kill -0 "${app_pid}" 2>/dev/null; then
    kill "${app_pid}" 2>/dev/null || true
    wait "${app_pid}" 2>/dev/null || true
  fi
  if [[ -n "${redis_pid}" ]]; then
    kill "${redis_pid}" 2>/dev/null || true
    wait "${redis_pid}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [[ -z "${REDIS_URL:-}" ]]; then
  redis_data_dir="${REDIS_DATA_DIR:-${HOME}/.local/state/elisha-sports-bot/redis}"
  mkdir -p "${redis_data_dir}"

  redis-server \
    --bind 127.0.0.1 \
    --port 6379 \
    --dir "${redis_data_dir}" \
    --save "" \
    --appendonly yes \
    --appendfsync always \
    --loglevel warning &
  redis_pid=$!
  export REDIS_URL=redis://127.0.0.1:6379

  for _ in {1..50}; do
    if redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1; then
      break
    fi
    if ! kill -0 "${redis_pid}" 2>/dev/null; then
      wait "${redis_pid}"
    fi
    sleep 0.1
  done

  if ! redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1; then
    echo "Redis failed to start on 127.0.0.1:6379" >&2
    exit 1
  fi
fi

NODE_ENV=development \
PORT=5000 \
npm run dev &
app_pid=$!
wait "${app_pid}"
