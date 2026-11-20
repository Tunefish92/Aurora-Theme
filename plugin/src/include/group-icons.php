<?php
// Group icons uploaded from the PC or fetched from a URL (#40); see GroupIconsLib.php.
//   GET  ?file=<sha1>.<ext>             the stored image
//   POST action=upload, data=<base64>   stores an image from the PC
//   POST action=fetch, url=<http(s)>    downloads an image and stores it
// Both POSTs answer {"icon": "upload:<sha1>.<ext>"} or {"error": "..."}; the group itself is saved
// by docker-groups.php. Unraid checks its csrf_token on every POST before this file runs.
// The POSTs are URL-encoded forms, as Unraid's own uploads up to 7.2 are: a multipart body never
// reaches this file, because Unraid's login check in front of it waits for that body for ever.

require_once __DIR__ . '/GroupIconsLib.php';

const AURORA_GROUP_FILES = ['/boot/config/plugins/Aurora-Theme/docker-groups.json', '/boot/config/plugins/Aurora-Theme/vm-groups.json'];

/**
 * Sends a JSON answer with the given HTTP status and ends the request.
 */
function aurora_group_icon_answer(array $answer, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode($answer);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    $name = (string) ($_GET['file'] ?? '');
    $file = aurora_group_icon_file('upload:' . $name);
    if ($file === '' || !is_file(AURORA_GROUP_ICON_DIR . '/' . $file)) {
        http_response_code(404);
        exit;
    }
    // Named by content, so it never changes; served as an image only, never run as a page.
    header('Content-Type: ' . AURORA_GROUP_ICON_MIME[pathinfo($file, PATHINFO_EXTENSION)]);
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    header('Cache-Control: private, max-age=31536000, immutable');
    readfile(AURORA_GROUP_ICON_DIR . '/' . $file);
    exit;
}

$action = (string) ($_POST['action'] ?? '');
if ($action === 'upload') {
    $data = (string) ($_POST['data'] ?? '');
    // Base64 makes 4 characters of 3 bytes.
    if (strlen($data) > intdiv(AURORA_GROUP_ICON_MAX_BYTES + 2, 3) * 4) {
        aurora_group_icon_answer(['error' => 'The image is larger than 1 MB.'], 400);
    }
    $bytes = base64_decode($data, true);
    if (!is_string($bytes) || $bytes === '') {
        aurora_group_icon_answer(['error' => 'No image was received.'], 400);
    }
} elseif ($action === 'fetch') {
    [$bytes, $error] = aurora_group_icon_download(trim((string) ($_POST['url'] ?? '')));
    if ($error !== '') {
        aurora_group_icon_answer(['error' => $error], 400);
    }
} else {
    aurora_group_icon_answer(['error' => 'Unknown action.'], 400);
}

[$icon, $error] = aurora_group_icon_store($bytes);
if ($error !== '') {
    aurora_group_icon_answer(['error' => $error], 400);
}
aurora_group_icons_prune(AURORA_GROUP_FILES);
aurora_group_icon_answer(['icon' => $icon]);
