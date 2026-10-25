#!/bin/bash
# Fake docker CLI: hands its arguments to the fake dockerd (dockerd.mjs).
[ "$1" = exec ] && exit 1
printf '%s\n' "$@" | curl -s --unix-socket /var/run/docker.sock --data-binary @- http://docker/_cli
echo
