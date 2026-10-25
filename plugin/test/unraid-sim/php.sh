#!/bin/bash
# PHP's built-in server for the fake Unraid root, on 127.0.0.1:$PHP_PORT, set up like Unraid's
# PHP: short open tags, its local_prepend.php, and no gettext extension (Unraid defines _()).
HERE=$(cd "$(dirname "$0")" && pwd)
CONF=$(mktemp -d /tmp/sim/php-conf.XXXXXX)
SCAN=$(php --ini | sed -n 's/^Scan for additional .ini files in: *//p')
[ -d "$SCAN" ] && cp "$SCAN"/*.ini "$CONF"/ 2>/dev/null
rm -f "$CONF"/*gettext*
cd /usr/local/emhttp
PHP_INI_SCAN_DIR=$CONF PHP_CLI_SERVER_WORKERS=${WORKERS:-12} exec php -d short_open_tag=On \
  -d auto_prepend_file=/usr/local/emhttp/webGui/include/local_prepend.php -d display_errors=stderr -d log_errors=Off \
  -d "error_reporting=E_ALL & ~E_DEPRECATED & ~E_NOTICE & ~E_WARNING" -d memory_limit=512M \
  -S "127.0.0.1:${PHP_PORT:-8081}" -t /usr/local/emhttp "$HERE/router.php"
