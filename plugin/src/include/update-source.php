<?php
// Saves the location the settings page's "Update" button installs from.
//   POST source=<absolute path or http(s) URL ending in .plg>   (Unraid checks csrf_token first)
const AURORA_SOURCE_FILE = '/boot/config/plugins/Aurora-Theme/update-source';

header('Content-Type: application/json');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST only']);
    exit;
}

$source = trim((string) ($_POST['source'] ?? ''));
// Same rule as the settings page: only plain characters, so the path can be passed on as-is.
if (!preg_match('#^(/|https?://)[A-Za-z0-9._~:/@%+,=-]+\.plg$#', $source)) {
    http_response_code(400);
    echo json_encode(['error' => 'Use an absolute path or an http(s) address ending in .plg, without spaces or special characters.']);
    exit;
}
if ($source[0] === '/' && !is_file($source)) {
    http_response_code(400);
    echo json_encode(['error' => 'There is no file at that path.']);
    exit;
}
if (!is_dir(dirname(AURORA_SOURCE_FILE))) {
    mkdir(dirname(AURORA_SOURCE_FILE), 0755, true);
}
if (file_put_contents(AURORA_SOURCE_FILE, $source . "\n", LOCK_EX) === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not save the location on the flash drive.']);
    exit;
}
echo json_encode(['source' => $source]);
