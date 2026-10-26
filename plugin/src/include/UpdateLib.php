<?php
// Updates come from the plugin's GitHub releases: the newest release's Aurora-Theme.plg.
// Used by include/check-update.php ("Check for updates") and scripts/autoupdate.php.
// Two channels (setting "channel"): "stable" takes the newest release, "dev" also the dev builds,
// GitHub pre-releases whose version ends in "-dev" ("2026.10.27.1200-dev"). Unraid compares
// versions as text, so a dev build counts as newer than the stable release of the same minute
// and older than any later one.

const AURORA_PLUGIN = 'Aurora-Theme';
const AURORA_REPO = '@@GITHUB_REPO@@';
const AURORA_RELEASE_API = 'https://api.github.com/repos/' . AURORA_REPO . '/releases/latest';
const AURORA_RELEASES_API = 'https://api.github.com/repos/' . AURORA_REPO . '/releases?per_page=30';
const AURORA_RELEASE_PLG = 'https://github.com/' . AURORA_REPO . '/releases/latest/download/' . AURORA_PLUGIN . '.plg';
const AURORA_RELEASES_PAGE = 'https://github.com/' . AURORA_REPO . '/releases';

/** One setting: the user's value, else the plugin's default (as Unraid's parse_plugin_cfg() does). */
function aurora_setting(string $key): string
{
    static $settings = null;
    if ($settings === null) {
        $defaults = @parse_ini_file('/usr/local/emhttp/plugins/' . AURORA_PLUGIN . '/default.cfg') ?: [];
        $user = @parse_ini_file('/boot/config/plugins/' . AURORA_PLUGIN . '/' . AURORA_PLUGIN . '.cfg') ?: [];
        $settings = array_merge($defaults, $user);
    }
    return (string) ($settings[$key] ?? '');
}

/** The update channel: 'dev' when dev builds are wanted, else 'stable'. */
function aurora_channel(): string
{
    return aurora_setting('channel') === 'dev' ? 'dev' : 'stable';
}

function aurora_is_dev(string $version): bool
{
    return substr($version, -4) === '-dev';
}

/**
 * When automatic updates run: ['cron' => cron time fields, 'text' => "every day at 03:00"].
 * Settings: autoupdate_when (hourly, daily, weekly), autoupdate_day (0 Sunday ... 6 Saturday),
 * autoupdate_time (HH:MM, for daily and weekly).
 */
function aurora_update_schedule(): array
{
    $when = aurora_setting('autoupdate_when');
    if (!preg_match('/^([01]\d|2[0-3]):([0-5]\d)$/', aurora_setting('autoupdate_time'), $time)) $time = ['', '03', '00'];
    $day = preg_match('/^[0-6]$/', aurora_setting('autoupdate_day')) ? (int) aurora_setting('autoupdate_day') : 0;
    $days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    $minute = (int) $time[2];
    $hour = (int) $time[1];
    if ($when === 'daily') return ['cron' => "$minute $hour * * *", 'text' => "every day at {$time[1]}:{$time[2]}"];
    if ($when === 'weekly') return ['cron' => "$minute $hour * * $day", 'text' => "every {$days[$day]} at {$time[1]}:{$time[2]}"];
    return ['cron' => '23 * * * *', 'text' => 'every hour'];
}

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

/** A download address of this plugin's .plg in one of its GitHub releases, or ''. */
function aurora_release_asset(string $url): string
{
    $prefix = 'https://github.com/' . AURORA_REPO . '/releases/download/';
    return strpos($url, $prefix) === 0 && preg_match('#^[A-Za-z0-9._-]+/' . AURORA_PLUGIN . '\.plg$#', substr($url, strlen($prefix))) ? $url : '';
}

/** The GitHub API's answer for $url, decoded, or null. */
function aurora_github_api(string $url)
{
    exec('/usr/bin/curl -fsSL --max-time 20 -H ' . escapeshellarg('Accept: application/vnd.github+json')
        . ' -A ' . escapeshellarg(AURORA_PLUGIN . '-update-check') . ' ' . escapeshellarg($url) . ' 2>/dev/null', $output, $status);
    return $status === 0 ? json_decode(implode("\n", $output), true) : null;
}

/** ['version', 'page', 'plg'] of one release from the GitHub API, or null when it has no valid .plg. */
function aurora_release_info($data): ?array
{
    $tag = is_array($data) && empty($data['draft']) ? ltrim((string) ($data['tag_name'] ?? ''), 'vV') : '';
    if (!preg_match('/^\d{4}\.\d{2}\.\d{2}[\w.-]*$/', $tag)) return null;
    $plg = '';
    foreach ((array) ($data['assets'] ?? []) as $asset) {
        if (($asset['name'] ?? '') === AURORA_PLUGIN . '.plg') $plg = aurora_release_asset((string) ($asset['browser_download_url'] ?? ''));
    }
    return ['version' => $tag, 'page' => (string) ($data['html_url'] ?? AURORA_RELEASES_PAGE), 'plg' => $plg];
}

/**
 * The newest release: ['version' => '2026.10.14.2219', 'page' => release URL, 'plg' => URL of
 * its .plg] or ['error' => text].
 * Asks the GitHub API first (a few bytes); if that fails, for example because of its hourly
 * limit, the release's .plg itself is downloaded and read.
 *
 * 'plg' is the address of that exact release's file. The "latest" address keeps pointing to the
 * previous release for a minute or two after a new one is published, so installing from it
 * right after a check could bring an older version than the check reported, and the next check
 * would offer an update again.
 */
function aurora_latest_release(string $channel = ''): array
{
    // Dev channel: the newest of the recent releases, dev builds (pre-releases) included. If the
    // list cannot be read, the newest stable release is the answer.
    if (($channel ?: aurora_channel()) === 'dev') {
        $newest = null;
        foreach ((array) aurora_github_api(AURORA_RELEASES_API) as $data) {
            $release = aurora_release_info($data);
            if ($release && $release['plg'] && (!$newest || strcmp($release['version'], $newest['version']) > 0)) $newest = $release;
        }
        if ($newest) return $newest;
    }
    $release = aurora_release_info(aurora_github_api(AURORA_RELEASE_API));
    if ($release) {
        return ['plg' => $release['plg'] ?: AURORA_RELEASE_PLG] + $release;
    }
    $file = tempnam('/tmp', 'aurora-release-');
    exec('/usr/bin/curl -fsSL --max-time 90 -o ' . escapeshellarg($file) . ' ' . escapeshellarg(AURORA_RELEASE_PLG) . ' 2>&1', $download, $status);
    $version = $status === 0 ? aurora_plg_version($file) : '';
    @unlink($file);
    if ($version !== '') {
        return ['version' => $version, 'page' => AURORA_RELEASES_PAGE, 'plg' => AURORA_RELEASE_PLG];
    }
    return ['error' => $status === 0
        ? 'The newest release on GitHub has no valid ' . AURORA_PLUGIN . '.plg.'
        : 'GitHub could not be reached: ' . trim(implode(' ', $download))];
}
