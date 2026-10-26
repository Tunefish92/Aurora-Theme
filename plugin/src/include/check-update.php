<?php
// "Check for updates" on the settings page: compares the newest GitHub release with the
// installed version. Nothing is installed here.
//   POST  returns {"installed", "available", "channel", "newer", "switch", "page", "plg", "message"}
//         or {"error"}; "switch": a dev build is installed and the stable release is offered.
// Unraid checks its csrf_token on every POST before this file runs.
require __DIR__ . '/UpdateLib.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST only']);
    exit;
}

$installed = aurora_installed_version();
$latest = aurora_latest_release();
if (isset($latest['error'])) {
    http_response_code(502);
    echo json_encode(['installed' => $installed, 'error' => $latest['error']]);
    exit;
}
$newer = strcmp($latest['version'], $installed) > 0;
// A dev build is installed but the channel is stable again: the newest stable release is older
// than the dev build, so it is offered as a switch back (installed with "forced").
$switch = !$newer && aurora_is_dev($installed) && aurora_channel() === 'stable' && !aurora_is_dev($latest['version']);
echo json_encode([
    'installed' => $installed,
    'available' => $latest['version'],
    'channel' => aurora_channel(),
    'newer' => $newer,
    'switch' => $switch,
    'page' => $latest['page'],
    'plg' => $latest['plg'],
    'message' => $switch
        ? "You are on the dev build $installed. The stable channel's newest release is {$latest['version']}."
        : ($newer
        ? (aurora_is_dev($latest['version']) ? "Dev build {$latest['version']}" : "Version {$latest['version']}") . " is available on GitHub (installed: $installed)."
        : (strcmp($installed, $latest['version']) > 0
            ? "Installed version $installed is newer than the newest release ({$latest['version']})."
            : "Installed version $installed is the newest " . (aurora_channel() === 'dev' ? 'build' : 'release') . '.')),
]);
