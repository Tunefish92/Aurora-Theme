#!/usr/bin/env bash
# Group icons (#40) through a web server set up like Unraid's: nginx with a login check
# (auth_request to Unraid's own auth-request.php) in front of PHP-FPM 8.3, which runs Unraid's
# local_prepend.php (the csrf_token check) before Aurora's include/*.php, all in Docker. First the
# endpoints with curl, then group_icons.mjs in the browser against this server instead of its
# stand-ins. The dev build 2026.11.20.1424 hung here: its multipart uploads never got past the
# login check, which is what happened on real servers.
#
#   UNRAID_WEBGUI=/tmp/webgui FV3=/tmp/fv3 plugin/test/group_icons_stack.sh
#
# Needs Docker, curl, Node with Playwright, a webgui and a FolderView3 checkout (as for
# fv3_compat.mjs). Exits with 1 on a failed check.
set -uo pipefail

repo=$(cd "$(dirname "$0")/../.." && pwd)
webgui=${UNRAID_WEBGUI:?set UNRAID_WEBGUI to a checkout of https://github.com/unraid/webgui}
port=${AURORA_STACK_PORT:-18080}
name=aurora-stack-$$
work=$(mktemp -d)
token=fixture-csrf-token
session=fixture0session0id

# Removes the containers, their network and the temporary files (PHP-FPM wrote some of them as
# www-data, so they are handed back first).
cleanup() {
    docker exec "$name-php" chown -R "$(id -u):$(id -g)" /boot /usr/local/emhttp >/dev/null 2>&1
    docker rm -f "$name-php" "$name-nginx" >/dev/null 2>&1
    docker network rm "$name" >/dev/null 2>&1
    rm -rf "$work"
}
trap cleanup EXIT

mkdir -p "$work/www/plugins/Aurora-Theme" "$work/www/state" "$work/boot/config/plugins/Aurora-Theme"
cp -r "$repo/plugin/src/include" "$work/www/plugins/Aurora-Theme/"
cp "$webgui/emhttp/auth-request.php" "$work/www/"
cp "$webgui/emhttp/plugins/dynamix/include/local_prepend.php" "$work/local_prepend.php"
printf 'csrf_token="%s"\n' "$token" >"$work/www/state/var.ini"
echo 'auto_prepend_file=/local_prepend.php' >"$work/php.ini"
# 20 MB bodies, as Unraid's file manager sends them since 7.3.
cat >"$work/nginx.conf" <<'EOF'
server {
    listen 80;
    root /usr/local/emhttp;
    client_max_body_size 20m;
    auth_request /auth-request.php;
    location = /auth-request.php {
        fastcgi_pass php:9000;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME /usr/local/emhttp/auth-request.php;
    }
    location ~ ^(.+\.php)(.*)$ {
        fastcgi_split_path_info ^(.+\.php)(.*)$;
        fastcgi_pass php:9000;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }
}
EOF

docker network create "$name" >/dev/null
docker run -d --name "$name-php" --network "$name" --network-alias php \
    -v "$work/www:/usr/local/emhttp" -v "$work/local_prepend.php:/local_prepend.php:ro" \
    -v "$work/php.ini:/usr/local/etc/php/conf.d/zz-unraid.ini:ro" -v "$work/boot:/boot" php:8.3-fpm >/dev/null
docker run -d --name "$name-nginx" --network "$name" -p "127.0.0.1:$port:80" \
    -v "$work/www:/usr/local/emhttp:ro" -v "$work/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine >/dev/null
for _ in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$port/" && break; sleep 1; done
# A logged-in session for Unraid's login check; PHP-FPM writes as www-data.
docker exec "$name-php" sh -c "chown -R www-data /boot /usr/local/emhttp/state && printf 'unraid_login|i:%s;' \$(date +%s) >/tmp/sess_$session && chown www-data /tmp/sess_$session"
cookie="unraid_$(printf 127.0.0.1 | md5sum | cut -c1-32)=$session"
base="http://127.0.0.1:$port/plugins/Aurora-Theme/include"
icons=$work/boot/config/plugins/Aurora-Theme/group-icons
failed=0

# Prints one check's result; a difference counts as a failure.
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: got [$2], want [$3]"; failed=1; fi
}
# POSTs URL-encoded fields with the session and, unless NO_TOKEN is set, the csrf_token.
post() {
    local target=$1
    shift
    local fields=()
    if [ -z "${NO_TOKEN:-}" ]; then fields=(--data-urlencode "csrf_token=$token"); fi
    curl -s -m 30 -b "$cookie" "${fields[@]}" "$@" "$base/$target"
}

png=$work/icon.png
printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' | base64 -d >"$png"
sha=$(sha1sum "$png" | cut -c1-40)

check "upload, URL-encoded base64" "$(post group-icons.php --data-urlencode action=upload --data-urlencode "data=$(base64 -w0 "$png")")" "{\"icon\":\"upload:$sha.png\"}"
check "stored on the flash drive" "$(ls "$icons")" "$sha.png"
check "served" "$(curl -s -b "$cookie" "$base/group-icons.php?file=$sha.png" | cmp -s - "$png" && echo same)" "same"
check "served as an image only" "$(curl -s -o /dev/null -D - -b "$cookie" "$base/group-icons.php?file=$sha.png" | grep -ciE '^(content-type: image/png|x-content-type-options: nosniff|content-security-policy: default-src .none.; sandbox)')" "3"
check "not logged in: no image" "$(curl -s -o /dev/null -w '%{http_code}' "$base/group-icons.php?file=$sha.png")" "401"
check "without csrf_token: refused" "$(NO_TOKEN=1 post group-icons.php --data-urlencode action=upload --data-urlencode "data=$(base64 -w0 "$png")" -o /dev/null -w '%{http_code}')" "403"
check "not an image: refused" "$(post group-icons.php --data-urlencode action=upload --data-urlencode "data=$(printf '<svg><script>1</script></svg>' | base64 -w0)")" '{"error":"This is not a PNG, JPEG, GIF or WebP image."}'
check "over 1 MB: refused" "$(head -c 1100000 /dev/zero | base64 -w0 | sed 's/^/action=upload\&data=/' | curl -s -m 30 -b "$cookie" --data-urlencode "csrf_token=$token" --data @- "$base/group-icons.php")" '{"error":"The image is larger than 1 MB."}'
check "not base64: refused" "$(post group-icons.php --data-urlencode action=upload --data-urlencode 'data=***')" '{"error":"No image was received."}'
fetched=$(post group-icons.php --data-urlencode action=fetch --data-urlencode url=https://raw.githubusercontent.com/unraid/webgui/master/emhttp/plugins/dynamix.docker.manager/images/question.png)
check "fetch a PNG from the web" "$(echo "$fetched" | grep -cE '^\{"icon":"upload:[0-9a-f]{40}\.png"\}$')" "1"
check "fetch a web page: refused" "$(post group-icons.php --data-urlencode action=fetch --data-urlencode url=https://example.com/)" '{"error":"This is not a PNG, JPEG, GIF or WebP image."}'
check "fetch file://: refused" "$(post group-icons.php --data-urlencode action=fetch --data-urlencode url=file:///etc/passwd)" '{"error":"Enter a web address that starts with http:\/\/ or https:\/\/."}'
saved=$(post docker-groups.php --data-urlencode "groups=[{\"name\":\"Media\",\"containers\":[],\"icon\":\"upload:$sha.png\"},{\"name\":\"Bad\",\"containers\":[],\"icon\":\"https://example.com/x.png\"}]")
check "groups saved with the valid icon only" "$saved" "{\"groups\":[{\"name\":\"Media\",\"containers\":[],\"icon\":\"upload:$sha.png\"},{\"name\":\"Bad\",\"containers\":[]}]}"
check "no PHP warnings" "$(docker logs "$name-php" 2>&1 | grep -ciE 'php (warning|notice|fatal)')" "0"

# The browser: group_icons.mjs against this server (its groups need the uploaded icon above).
AURORA_STACK="http://127.0.0.1:$port" AURORA_STACK_COOKIE="$cookie" AURORA_STACK_TOKEN="$token" node "$repo/plugin/test/group_icons.mjs" || failed=1
exit $failed
