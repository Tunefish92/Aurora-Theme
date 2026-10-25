#!/bin/bash
# Runs the edge-case checks on a fake Unraid server: Unraid's real webGui (a checkout of
# https://github.com/unraid/webgui) served by PHP's built-in server, a fake Docker daemon and
# libvirt, FolderView Plus or FolderView3 installed from their checkouts, and Aurora from this
# working tree. Everything runs in its own mount and process namespace: Unraid's paths
# (/usr/local/emhttp, /boot, /var/local/emhttp, /var/lib/docker, /var/run, ...) are temporary
# directories there, and the machine's own are not touched (missing mount points are created
# empty). Needs root (or sudo), Linux, PHP 8.3 CLI, Node 22 and Playwright with Chromium.
#
#   sudo -E plugin/test/unraid-sim/run.sh --webgui DIR --fvp DIR --fv3 DIR [--only REGEX] [--shots DIR] [--shard i/n] [--port 8080]
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
export AURORA_REPO=$(cd "$HERE/../../.." && pwd)
WEBGUI= ONLY= SHOTS= SHARD=0/1 PORT=8080
while [ $# -gt 0 ]; do
  case "$1" in
    --webgui) WEBGUI=$(cd "$2" && pwd); shift 2 ;;
    --fvp) export FVP=$(cd "$2" && pwd); shift 2 ;;
    --fv3) export FV3=$(cd "$2" && pwd); shift 2 ;;
    --only) ONLY=$2; shift 2 ;;
    --shots) mkdir -p "$2"; SHOTS=$(cd "$2" && pwd); shift 2 ;;
    --shard) SHARD=$2; shift 2 ;;
    --port) PORT=$2; shift 2 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
[ -d "$WEBGUI/emhttp" ] || { echo "--webgui: a checkout of unraid/webgui" >&2; exit 2; }
[ "$(id -u)" = 0 ] || { echo "needs root (sudo -E)" >&2; exit 2; }
export WEBGUI ONLY SHOTS SHARD PORT
exec unshare --mount --pid --fork --mount-proc "$HERE/inside.sh"
