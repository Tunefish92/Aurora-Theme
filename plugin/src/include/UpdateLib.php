<?php
// Updates come from the plugin's GitHub releases: the newest release's Aurora-Theme.plg.
// Used by include/check-update.php ("Check for updates") and scripts/autoupdate.php.

const AURORA_PLUGIN = 'Aurora-Theme';
const AURORA_REPO = '@@GITHUB_REPO@@';
const AURORA_RELEASE_API = 'https://api.github.com/repos/' . AURORA_REPO . '/releases/latest';
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
function aurora_latest_release(): array
{
    exec('/usr/bin/curl -fsSL --max-time 20 -H ' . escapeshellarg('Accept: application/vnd.github+json')
        . ' -A ' . escapeshellarg(AURORA_PLUGIN . '-update-check') . ' ' . escapeshellarg(AURORA_RELEASE_API) . ' 2>/dev/null', $output, $status);
    $data = $status === 0 ? json_decode(implode("\n", $output), true) : null;
    $tag = is_array($data) ? ltrim((string) ($data['tag_name'] ?? ''), 'vV') : '';
    if (preg_match('/^\d{4}\.\d{2}\.\d{2}[\w.-]*$/', $tag)) {
        $plg = '';
        foreach ((array) ($data['assets'] ?? []) as $asset) {
            if (($asset['name'] ?? '') === AURORA_PLUGIN . '.plg') $plg = aurora_release_asset((string) ($asset['browser_download_url'] ?? ''));
        }
        return ['version' => $tag, 'page' => (string) ($data['html_url'] ?? AURORA_RELEASES_PAGE), 'plg' => $plg ?: AURORA_RELEASE_PLG];
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
