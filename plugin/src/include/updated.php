<?php
// After Aurora was updated: the version change for the "Aurora Theme updated" dialog
// (scripts/updated.js). The install script leaves the record in updated.json on the flash drive
// when the installed version changes; scripts/autoupdate.php marks it as an automatic update.
//   GET   {"from", "to", "time", "automatic", "notes", "page"}: notes are the Markdown text of the
//         GitHub release of that version ('' when it has none, such as a development build),
//         fetched once and kept with the record.
//   POST  the dialog was closed: the record is removed.
// Unraid checks its csrf_token on every POST before this file runs.
require_once '/usr/local/emhttp/plugins/Aurora-Theme/include/UpdateLib.php';

const AURORA_UPDATED_FILE = '/boot/config/plugins/' . AURORA_PLUGIN . '/updated.json';

header('Content-Type: application/json');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    @unlink(AURORA_UPDATED_FILE);
    echo json_encode(['ok' => true]);
    exit;
}

$record = json_decode((string) @file_get_contents(AURORA_UPDATED_FILE), true);
$version = '/^\d{4}\.\d{2}\.\d{2}[\w.-]*$/';
if (!is_array($record) || !preg_match($version, (string) ($record['to'] ?? '')) || !preg_match($version, (string) ($record['from'] ?? ''))) {
    echo '{}';
    exit;
}

if (!array_key_exists('notes', $record)) {
    $api = 'https://api.github.com/repos/' . AURORA_REPO . '/releases/tags/v' . $record['to'];
    exec('/usr/bin/curl -sSL --max-time 10 -w ' . escapeshellarg('\n%{http_code}') . ' -H ' . escapeshellarg('Accept: application/vnd.github+json')
        . ' -A ' . escapeshellarg(AURORA_PLUGIN . '-release-notes') . ' ' . escapeshellarg($api) . ' 2>/dev/null', $output);
    $code = (int) array_pop($output);
    $release = $code === 200 ? json_decode(implode("\n", $output), true) : null;
    // Kept only when GitHub answered: no release for this version (404) is an answer too, a
    // network problem is not, and the next page asks again.
    if ($code === 200 || $code === 404) {
        $record['notes'] = is_array($release) ? mb_substr((string) ($release['body'] ?? ''), 0, 20000) : '';
        $record['page'] = is_array($release) && preg_match('#^https://github\.com/#', (string) ($release['html_url'] ?? '')) ? $release['html_url'] : AURORA_RELEASES_PAGE;
        @file_put_contents(AURORA_UPDATED_FILE, json_encode($record) . "\n");
    }
}

echo json_encode([
    'from' => $record['from'],
    'to' => $record['to'],
    'time' => (int) ($record['time'] ?? 0),
    'automatic' => !empty($record['automatic']),
    'notes' => $record['notes'] ?? null,
    'page' => $record['page'] ?? AURORA_RELEASES_PAGE,
]);
