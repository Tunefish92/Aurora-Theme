#!/bin/bash
# Inside run.sh's namespaces: Unraid's paths become temporary directories, the fake server
# starts (setup.sh, dockerd.mjs, php.sh, front.mjs) and the checks run (checks.mjs).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
mount --make-rprivate /
ROOT=$(mktemp -d /tmp/unraid-sim.XXXXXX)
for dir in /usr/local/emhttp /usr/local/sbin /boot /var/local/emhttp /var/lib/docker /var/run /etc/rc.d /etc/libvirt /tmp/sim /tmp/tailscale; do
  mkdir -p "$ROOT$dir" "$dir"
  mount --bind "$ROOT$dir" "$dir"
done
trap 'rm -rf "$ROOT"' EXIT
"$HERE/setup.sh" "$WEBGUI"
node "$HERE/dockerd.mjs" > /tmp/sim/dockerd.log 2>&1 &
PHP_PORT=$((PORT + 1)) "$HERE/php.sh" > /tmp/sim/php.log 2>&1 &
PORT=$PORT PHP_PORT=$((PORT + 1)) node "$HERE/front.mjs" > /tmp/sim/front.log 2>&1 &
for i in $(seq 50); do curl -s -o /dev/null "http://127.0.0.1:$PORT/Docker" && break; sleep 0.2; done
SIM_ORIGIN="http://127.0.0.1:$PORT" node "$HERE/checks.mjs" ${ONLY:+"$ONLY"}
