#!/usr/bin/php
<?php
// Automatic updates for the Aurora Theme, run by cron (autoupdate.cron) at the time chosen on
// the settings page (scripts/schedule.php writes that entry).
// When "Automatic updates" is on, it installs the newest GitHub release if it is newer than
// the installed version, the same way the settings page's "Update now" button does. Either way
// Unraid shows a notification (a warning when it failed); after an update, the next webGUI page
// also shows what changed (the install script's updated.json, marked here as automatic).
// The outcome of the last check is kept in /var/lib/aurora-theme/autoupdate.json for that page.
require '/usr/local/emhttp/plugins/Aurora-Theme/include/UpdateLib.php';

const STATUS_FILE = '/var/lib/aurora-theme/autoupdate.json';

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

if (aurora_setting('autoupdate') !== 'yes') {
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
    $marker = '/boot/config/plugins/' . AURORA_PLUGIN . '/updated.json';
    $record = json_decode((string) @file_get_contents($marker), true);
    if (is_array($record) && ($record['to'] ?? '') === $available) {
        $record['automatic'] = true;
        @file_put_contents($marker, json_encode($record) . "\n");
    }
    notify('Aurora Theme updated', "Updated automatically from $installed to $available. Open the webGUI to see what changed.", 'normal');
    finish('updated', "Updated from $installed to $available.", $available);
}
exec('/usr/bin/logger -t aurora-theme ' . escapeshellarg('automatic update: plugin install said: ' . trim(implode(' ', array_slice($output, -6)))));
notify('Aurora Theme update failed', "Version $available could not be installed automatically.", 'warning');
finish('failed', "Installing $available failed: " . trim(implode(' ', array_slice($output, -3))), $installed);
