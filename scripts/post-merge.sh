#!/usr/bin/env bash
set -euo pipefail

npm install \
  --prefix elisha-sports-bot \
  --no-audit \
  --no-fund \
  --package-lock=false
