<?php
// Updates come from the plugin's GitHub releases: the newest release's Aurora-Theme.plg.
// Used by include/check-update.php ("Check for updates") and scripts/autoupdate.php.

const AURORA_PLUGIN = 'Aurora-Theme';
const AURORA_REPO = '@@GITHUB_REPO@@';
const AURORA_RELEASE_API = 'https://api.github.com/repos/' . AURORA_REPO . '/releases/latest';
const AURORA_RELEASE_PLG = 'https://github.com/' . AURORA_REPO . '/releases/latest/download/' . AURORA_PLUGIN . '.plg';
const AURORA_RELEASES_PAGE = 'https://github.com/' . AURORA_REPO . '/releases';

/** Version in a .plg file, or '' when the file is not this plugin. */
function aurora_plg_version(string $file): string
{
    $xml = is_file($file) ? @simplexml_load_file($file) : false;
    return $xml && (string) $xml['name'] === AURORA_PLUGIN ? (string) $xml['version'] : '';
}

function aurora_installed_version(): string
{
    return aurora_plg_version('/boot/config/plugins/' . AURORA_PLUGIN . '.plg');
}

/**
 * The newest release: ['version' => '2026.10.14.2219', 'page' => release URL] or ['error' => text].
 * Asks the GitHub API first (a few bytes); if that fails, for example because of its hourly
 * limit, the release's .plg itself is downloaded and read.
 */
function aurora_latest_release(): array
{
    exec('/usr/bin/curl -fsSL --max-time 20 -H ' . escapeshellarg('Accept: application/vnd.github+json')
        . ' -A ' . escapeshellarg(AURORA_PLUGIN . '-update-check') . ' ' . escapeshellarg(AURORA_RELEASE_API) . ' 2>/dev/null', $output, $status);
    $data = $status === 0 ? json_decode(implode("\n", $output), true) : null;
    $tag = is_array($data) ? ltrim((string) ($data['tag_name'] ?? ''), 'vV') : '';
    if (preg_match('/^\d{4}\.\d{2}\.\d{2}[\w.-]*$/', $tag)) {
        return ['version' => $tag, 'page' => (string) ($data['html_url'] ?? AURORA_RELEASES_PAGE)];
    }
    $file = tempnam('/tmp', 'aurora-release-');
    exec('/usr/bin/curl -fsSL --max-time 90 -o ' . escapeshellarg($file) . ' ' . escapeshellarg(AURORA_RELEASE_PLG) . ' 2>&1', $download, $status);
    $version = $status === 0 ? aurora_plg_version($file) : '';
    @unlink($file);
    if ($version !== '') {
        return ['version' => $version, 'page' => AURORA_RELEASES_PAGE];
    }
    return ['error' => $status === 0
        ? 'The newest release on GitHub has no valid ' . AURORA_PLUGIN . '.plg.'
        : 'GitHub could not be reached: ' . trim(implode(' ', $download))];
}
