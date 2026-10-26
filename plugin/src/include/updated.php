<?php
// After Aurora was updated: the version change for the "Aurora Theme updated" dialog
// (scripts/updated.js). The install script leaves the record in updated.json on the flash drive
// when the installed version changes; scripts/autoupdate.php marks it as an automatic update.
//   GET   {"from", "to", "time", "automatic", "releases", "page"}: releases are the GitHub
//         releases after "from" up to and including "to", newest first, each {"version", "date",
//         "notes" (Markdown), "page"}, so an update across several versions shows every change.
//         Dev builds are among them only when "to" is one. Back to an older version: only that
//         version's release. Fetched once and kept with the record; null when GitHub could not be
//         asked, [] when no release lies in between (such as a local build).
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

/**
 * The releases for the record, newest first, or null when GitHub did not answer. Pages of 100
 * are read until one reaches back to "from" (at most 5, so 500 releases).
 */
function aurora_releases_between(string $from, string $to): ?array
{
    $back = strcmp($to, $from) < 0;
    $dev = aurora_is_dev($to);
    $found = [];
    for ($pageNumber = 1; $pageNumber <= 5; $pageNumber++) {
        $api = 'https://api.github.com/repos/' . AURORA_REPO . '/releases?per_page=100&page=' . $pageNumber;
        $output = [];
        exec('/usr/bin/curl -sSL --max-time 15 -w ' . escapeshellarg('\n%{http_code}') . ' -H ' . escapeshellarg('Accept: application/vnd.github+json')
            . ' -A ' . escapeshellarg(AURORA_PLUGIN . '-release-notes') . ' ' . escapeshellarg($api) . ' 2>/dev/null', $output);
        $code = (int) array_pop($output);
        $list = $code === 200 ? json_decode(implode("\n", $output), true) : null;
        if (!is_array($list)) return $pageNumber === 1 ? null : $found;
        $older = false;
        foreach ($list as $release) {
            $version = is_array($release) && empty($release['draft']) ? ltrim((string) ($release['tag_name'] ?? ''), 'vV') : '';
            if (!preg_match('/^\d{4}\.\d{2}\.\d{2}[\w.-]*$/', $version)) continue;
            if (strcmp($version, $from) <= 0) $older = true;
            $wanted = $back ? $version === $to : strcmp($version, $from) > 0 && strcmp($version, $to) <= 0 && ($dev || !aurora_is_dev($version));
            if (!$wanted) continue;
            $found[$version] = [
                'version' => $version,
                'date' => (string) ($release['published_at'] ?? ''),
                'notes' => mb_substr((string) ($release['body'] ?? ''), 0, 20000),
                'page' => preg_match('#^https://github\.com/#', (string) ($release['html_url'] ?? '')) ? $release['html_url'] : AURORA_RELEASES_PAGE,
            ];
        }
        if ($older || count($list) < 100) break;
    }
    krsort($found, SORT_STRING);
    return array_values($found);
}

if (!array_key_exists('releases', $record)) {
    $releases = aurora_releases_between($record['from'], $record['to']);
    // Kept only when GitHub answered; after a network problem the next page asks again.
    if ($releases !== null) {
        $record['releases'] = $releases;
        $record['page'] = count($releases) === 1 ? $releases[0]['page'] : AURORA_RELEASES_PAGE;
        @file_put_contents(AURORA_UPDATED_FILE, json_encode($record) . "\n");
    }
}

echo json_encode([
    'from' => $record['from'],
    'to' => $record['to'],
    'time' => (int) ($record['time'] ?? 0),
    'automatic' => !empty($record['automatic']),
    'releases' => $record['releases'] ?? null,
    'page' => $record['page'] ?? AURORA_RELEASES_PAGE,
]);
