<?php
// Docker list view while FolderView is installed: "aurora" (the theme's columns and groups) or
// "folderview" (FolderView's folders). Set from the switch above the Docker tab's list.
//   POST view=aurora|folderview   stores it in the plugin's settings
// Unraid checks its csrf_token on every POST before this file runs, so the setting can only be
// changed from a logged-in webGUI page.

const TFT_CFG_FILE = '/boot/config/plugins/Aurora-Theme/Aurora-Theme.cfg';

header('Content-Type: application/json');
header('Cache-Control: no-store');

$view = (string) ($_POST['view'] ?? '');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST' || !in_array($view, ['aurora', 'folderview'], true)) {
    http_response_code(400);
    echo json_encode(['error' => 'POST view=aurora or view=folderview']);
    exit;
}

// The settings file holds key="value" lines; only the dockerview line is replaced or added.
$lines = is_file(TFT_CFG_FILE) ? file(TFT_CFG_FILE, FILE_IGNORE_NEW_LINES) : [];
$lines = array_values(array_filter($lines, function ($line) { return strpos($line, 'dockerview=') !== 0; }));
$lines[] = 'dockerview="' . $view . '"';
if (!is_dir(dirname(TFT_CFG_FILE))) {
    mkdir(dirname(TFT_CFG_FILE), 0755, true);
}
if (file_put_contents(TFT_CFG_FILE, implode("\n", $lines) . "\n", LOCK_EX) === false) {
    http_response_code(500);
    echo json_encode(['error' => 'could not write ' . TFT_CFG_FILE]);
    exit;
}
echo json_encode(['view' => $view]);
