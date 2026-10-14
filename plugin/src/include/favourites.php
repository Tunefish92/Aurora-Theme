<?php
// Favourite cards on the Settings and Tools tabs.
//   GET                          returns {"favourites": ["Settings/Identification", ...]}
//   POST favourites=<JSON list>  replaces the stored list
// Unraid checks its csrf_token on every POST before this file runs, so writes can only come
// from a logged-in webGUI page. The list lives on the flash drive and survives reboots.

const TFT_FAVOURITES_FILE = '/boot/config/plugins/Aurora-Theme/favourites.json';

/** Keeps page paths such as "Settings/Identification", each once, in the order given. */
function tft_clean_favourites($list): array
{
    $clean = [];
    foreach (is_array($list) ? array_slice($list, 0, 200) : [] as $item) {
        if (is_string($item) && strlen($item) <= 120 && preg_match('#^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$#', $item) && !in_array($item, $clean, true)) {
            $clean[] = $item;
        }
    }
    return $clean;
}

header('Content-Type: application/json');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $input = json_decode((string) ($_POST['favourites'] ?? ''), true);
    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['error' => 'favourites must be a JSON list']);
        exit;
    }
    $favourites = tft_clean_favourites($input);
    if (!is_dir(dirname(TFT_FAVOURITES_FILE))) {
        mkdir(dirname(TFT_FAVOURITES_FILE), 0755, true);
    }
    if (file_put_contents(TFT_FAVOURITES_FILE, json_encode(['favourites' => $favourites], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n", LOCK_EX) === false) {
        http_response_code(500);
        echo json_encode(['error' => 'could not write ' . TFT_FAVOURITES_FILE]);
        exit;
    }
    echo json_encode(['favourites' => $favourites]);
    exit;
}

$stored = json_decode((string) @file_get_contents(TFT_FAVOURITES_FILE), true);
echo json_encode(['favourites' => tft_clean_favourites($stored['favourites'] ?? [])]);
