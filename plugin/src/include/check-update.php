<?php
// "Check for updates" on the settings page: compares the version at the install location
// (file path or http(s) address) with the installed one. Nothing is installed here.
//   POST  returns {"installed": "...", "available": "...", "newer": bool, "message": "..."}
// Unraid checks its csrf_token on every POST before this file runs.

const PLUGIN = 'Aurora-Theme';
const DOWNLOAD = '/tmp/aurora-theme-check.plg';

header('Content-Type: application/json');
header('Cache-Control: no-store');

function plg_version(string $file): string
{
    $xml = is_file($file) ? @simplexml_load_file($file) : false;
    // Only a file that really is this plugin counts.
    return $xml && (string) $xml['name'] === PLUGIN ? (string) $xml['version'] : '';
}

function answer(int $status, array $data): void
{
    http_response_code($status);
    echo json_encode($data);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    answer(405, ['error' => 'POST only']);
}

$installed = plg_version('/boot/config/plugins/' . PLUGIN . '.plg');
$source = trim((string) @file_get_contents('/boot/config/plugins/' . PLUGIN . '/update-source'));
if ($source === '') {
    answer(400, ['installed' => $installed, 'error' => 'No install location is known yet. Install the plugin once from a file path or address.']);
}
// Same rule as everywhere else: plain characters only, so the location can be passed on as-is.
if (!preg_match('#^(/|https?://)[A-Za-z0-9._~:/@%+,=-]+\.plg$#', $source)) {
    answer(400, ['installed' => $installed, 'error' => 'The install location contains characters that are not allowed.']);
}

$file = $source;
if (preg_match('#^https?://#', $source)) {
    @unlink(DOWNLOAD);
    exec('/usr/bin/curl -fsSL --max-time 60 -o ' . escapeshellarg(DOWNLOAD) . ' ' . escapeshellarg($source) . ' 2>&1', $output, $status);
    if ($status !== 0) {
        @unlink(DOWNLOAD);
        answer(502, ['installed' => $installed, 'error' => 'Could not download ' . $source . ': ' . trim(implode(' ', $output))]);
    }
    $file = DOWNLOAD;
} elseif (!is_file($source)) {
    answer(404, ['installed' => $installed, 'error' => 'The install file is not reachable right now: ' . $source]);
}

$available = plg_version($file);
if ($file === DOWNLOAD) {
    @unlink(DOWNLOAD);
}
if ($available === '') {
    answer(422, ['installed' => $installed, 'error' => 'The file at the install location is not an ' . PLUGIN . ' plugin file.']);
}
$newer = strcmp($available, $installed) > 0;
answer(200, [
    'installed' => $installed,
    'available' => $available,
    'newer' => $newer,
    'message' => $newer ? "Version $available is ready (installed: $installed)." : "Installed version $installed is the newest at the install location.",
]);
