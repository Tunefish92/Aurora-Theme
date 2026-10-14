<?php
// "Check for updates" on the settings page: compares the newest GitHub release with the
// installed version. Nothing is installed here.
//   POST  returns {"installed", "available", "newer", "page", "message"} or {"error"}
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
echo json_encode([
    'installed' => $installed,
    'available' => $latest['version'],
    'newer' => $newer,
    'page' => $latest['page'],
    'message' => $newer
        ? "Version {$latest['version']} is available on GitHub (installed: $installed)."
        : (strcmp($installed, $latest['version']) > 0
            ? "Installed version $installed is newer than the newest release ({$latest['version']})."
            : "Installed version $installed is the newest release."),
]);
