<?php
// Plugins page: Unraid checks every plugin for updates once per visit, with one download of
// the plugin's remote .plg, and its downloader does not retry HTTP errors. A single failed
// download leaves the row on "not available" (Unraid also deletes the file it had). The
// theme's script then asks this file to run the same check again, Unraid's own "plugin check",
// up to three times; the page redraws the row from the file that check leaves in /tmp/plugins.
//   POST plugin=<name>.plg   returns {"ok": true|false}
// Unraid checks its csrf_token on every POST before this file runs.
header('Content-Type: application/json');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST only']);
    exit;
}

// Only an installed plugin (Unraid keeps a link per installed plugin in /var/log/plugins). The
// OS itself has its own update check.
$plugin = (string) ($_POST['plugin'] ?? '');
if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._ -]*\.plg$/', $plugin) || $plugin === 'unRAIDServer.plg'
    || !is_link('/var/log/plugins/' . $plugin)) {
    http_response_code(400);
    echo json_encode(['error' => 'not an installed plugin']);
    exit;
}

set_time_limit(150);
$script = '/usr/local/emhttp/plugins/dynamix.plugin.manager/scripts/plugin';
$status = 1;
for ($try = 1; $try <= 3 && $status !== 0; $try++) {
    if ($try > 1) sleep(2 * ($try - 1));
    $output = [];
    exec(escapeshellarg($script) . ' check ' . escapeshellarg($plugin) . ' 2>&1', $output, $status);
}
echo json_encode(['ok' => $status === 0]);
