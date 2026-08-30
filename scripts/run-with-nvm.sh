#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "${NVM_DIR:-}" ]; then
  export NVM_DIR="$HOME/.nvm"
fi

if [ -s "$NVM_DIR/nvm.sh" ]; then
  # Load nvm for non-interactive npm scripts, then switch to the repo-pinned Node.
  . "$NVM_DIR/nvm.sh"
  nvm use >/dev/null
fi

node "$ROOT_DIR/scripts/ensure-node.mjs"

exec "$@"
