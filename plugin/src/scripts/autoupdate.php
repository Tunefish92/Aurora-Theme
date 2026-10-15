#!/usr/bin/php
<?php
// Automatic updates for the Aurora Theme, run every hour by cron (autoupdate.cron).
// When "Automatic updates" is on, it installs the newest GitHub release if it is newer than
// the installed version, the same way the settings page's "Update now" button does. A successful
// update is quiet (no Unraid notification); a failed one raises a warning.
// The outcome of the last check is kept in /var/lib/aurora-theme/autoupdate.json for that page.
require '/usr/local/emhttp/plugins/Aurora-Theme/include/UpdateLib.php';

const CONFIG_DIR = '/boot/config/plugins/' . AURORA_PLUGIN;
const STATUS_FILE = '/var/lib/aurora-theme/autoupdate.json';

function setting(string $key): string
{
    // The user's settings override the defaults, as Unraid's parse_plugin_cfg() does.
    $defaults = @parse_ini_file('/usr/local/emhttp/plugins/' . AURORA_PLUGIN . '/default.cfg') ?: [];
    $user = @parse_ini_file(CONFIG_DIR . '/' . AURORA_PLUGIN . '.cfg') ?: [];
    return (string) ($user[$key] ?? $defaults[$key] ?? '');
}

function finish(string $result, string $message, string $version = ''): void
{
    @mkdir(dirname(STATUS_FILE), 0755, true);
    file_put_contents(STATUS_FILE, json_encode(['time' => time(), 'result' => $result, 'message' => $message, 'version' => $version]) . "\n");
    // Every run leaves one line in the system log (Tools > System Log, tag aurora-theme).
    exec('/usr/bin/logger -t aurora-theme ' . escapeshellarg("automatic update: $message"));
    echo "$message\n";
    exit($result === 'failed' ? 1 : 0);
}

function notify(string $subject, string $description, string $level): void
{
    $notify = '/usr/local/emhttp/webGui/scripts/notify';
    if (is_executable($notify)) {
        exec($notify . ' -e ' . escapeshellarg('Aurora Theme') . ' -s ' . escapeshellarg($subject)
            . ' -d ' . escapeshellarg($description) . ' -i ' . escapeshellarg($level));
    }
}

// One run at a time, also when a run is started by hand while cron starts another.
$lock = fopen('/var/run/aurora-theme-autoupdate.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
    exit(0);
}

if (setting('autoupdate') !== 'yes') {
    finish('off', 'Automatic updates are turned off.');
}

$installed = aurora_installed_version();
$latest = aurora_latest_release();
if (isset($latest['error'])) {
    finish('skipped', $latest['error']);
}
$available = $latest['version'];
if (strcmp($available, $installed) <= 0) {
    finish('current', "Up to date ($installed).", $installed);
}

// The exact release that was found, not the "latest" address (see aurora_latest_release()).
exec('/usr/local/sbin/plugin install ' . escapeshellarg($latest['plg']) . ' 2>&1', $output, $status);
if (aurora_installed_version() === $available) {
    finish('updated', "Updated from $installed to $available.", $available);
}
exec('/usr/bin/logger -t aurora-theme ' . escapeshellarg('automatic update: plugin install said: ' . trim(implode(' ', array_slice($output, -6)))));
notify('Aurora Theme update failed', "Version $available could not be installed automatically.", 'warning');
finish('failed', "Installing $available failed: " . trim(implode(' ', array_slice($output, -3))), $installed);
