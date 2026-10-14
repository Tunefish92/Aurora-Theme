#!/usr/bin/php
<?php
// Automatic updates for the Aurora Theme, run every hour by cron (autoupdate.cron).
// When "Automatic updates" is on, it looks at the location the plugin was last installed from
// (a file path or an http(s) address ending in .plg) and installs the version there if it is
// newer than the installed one, the same way the settings page's "Update now" button does.
// The outcome of the last check is kept in /var/lib/aurora-theme/autoupdate.json for that page.

const PLUGIN = 'Aurora-Theme';
const CONFIG_DIR = '/boot/config/plugins/' . PLUGIN;
const STATUS_FILE = '/var/lib/aurora-theme/autoupdate.json';
const DOWNLOAD = '/tmp/aurora-theme-update.plg';

function setting(string $key): string
{
    // The user's settings override the defaults, as Unraid's parse_plugin_cfg() does.
    $defaults = @parse_ini_file('/usr/local/emhttp/plugins/' . PLUGIN . '/default.cfg') ?: [];
    $user = @parse_ini_file(CONFIG_DIR . '/' . PLUGIN . '.cfg') ?: [];
    return (string) ($user[$key] ?? $defaults[$key] ?? '');
}

function plg_version(string $file): string
{
    $xml = is_file($file) ? @simplexml_load_file($file) : false;
    // Only ever install a file that really is this plugin.
    return $xml && (string) $xml['name'] === PLUGIN ? (string) $xml['version'] : '';
}

function finish(string $result, string $message, string $version = ''): void
{
    @mkdir(dirname(STATUS_FILE), 0755, true);
    file_put_contents(STATUS_FILE, json_encode(['time' => time(), 'result' => $result, 'message' => $message, 'version' => $version]) . "\n");
    echo "$message\n";
    exit($result === 'failed' ? 1 : 0);
}

// One run at a time, also when a run is started by hand while cron starts another.
$lock = fopen('/var/run/aurora-theme-autoupdate.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
    exit(0);
}

if (setting('autoupdate') !== 'yes') {
    finish('off', 'Automatic updates are turned off.');
}

$source = trim((string) @file_get_contents(CONFIG_DIR . '/update-source'));
if ($source === '') {
    finish('skipped', 'No install location is known yet.');
}
// Same rule as the settings page: only plain characters, so the location can be passed on as-is.
if (!preg_match('#^(/|https?://)[A-Za-z0-9._~:/@%+,=-]+\.plg$#', $source)) {
    finish('failed', 'The install location contains characters that are not allowed.');
}

$installed = plg_version('/boot/config/plugins/' . PLUGIN . '.plg');
$file = $source;
if (preg_match('#^https?://#', $source)) {
    @unlink(DOWNLOAD);
    exec('/usr/bin/curl -fsSL --max-time 120 -o ' . escapeshellarg(DOWNLOAD) . ' ' . escapeshellarg($source) . ' 2>&1', $output, $status);
    if ($status !== 0) {
        finish('failed', 'Could not download ' . $source . ': ' . trim(implode(' ', $output)));
    }
    $file = DOWNLOAD;
} elseif (!is_file($source)) {
    // For example a share that is not available while the array is stopped.
    finish('skipped', 'The install file is not reachable right now: ' . $source);
}

$available = plg_version($file);
if ($available === '') {
    finish('failed', 'The file at the install location is not an ' . PLUGIN . ' plugin file.');
}
if (strcmp($available, $installed) <= 0) {
    if ($file === DOWNLOAD) {
        @unlink(DOWNLOAD);
    }
    finish('current', "Up to date ($installed).", $installed);
}

$output = [];
exec('/usr/local/sbin/plugin install ' . escapeshellarg($file) . ' 2>&1', $output, $status);
if ($file === DOWNLOAD) {
    @unlink(DOWNLOAD);
}
$updated = plg_version('/boot/config/plugins/' . PLUGIN . '.plg') === $available;
$notify = '/usr/local/emhttp/webGui/scripts/notify';
if ($updated) {
    if (is_executable($notify)) {
        exec($notify . ' -e ' . escapeshellarg('Aurora Theme') . ' -s ' . escapeshellarg('Aurora Theme updated')
            . ' -d ' . escapeshellarg("Version $available was installed automatically (was $installed).") . ' -i normal');
    }
    finish('updated', "Updated from $installed to $available.", $available);
}
if (is_executable($notify)) {
    exec($notify . ' -e ' . escapeshellarg('Aurora Theme') . ' -s ' . escapeshellarg('Aurora Theme update failed')
        . ' -d ' . escapeshellarg("Version $available could not be installed automatically.") . ' -i warning');
}
finish('failed', "Installing $available failed: " . trim(implode(' ', array_slice($output, -3))), $installed);
