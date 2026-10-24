<?php
// The sun / moon switch: changes only the theme key in dynamix.cfg and never loses the rest.
//   POST theme=black|white step=save    sets [display] theme, keeping every other key
//   POST theme=black|white step=verify  run after the Unraid API was told too: puts back any
//                                       key that went missing since "save", then forgets it
//   returns {"theme", "restored"} or {"error"}
// Unraid checks its csrf_token on every POST before this file runs.
//
// Why not /update.php: it merges into whatever it reads, and reads an empty list when the file
// is caught half written (the Unraid API rewrites dynamix.cfg too, a moment after setTheme).
// Two quick clicks then left a file with nothing but theme="..." (issue #22). Here the file is
// only written once it has been read whole, the write is atomic (temporary file, then rename),
// and the full content seen before the change is kept until "verify" has checked the result.

const AURORA_DYNAMIX_CFG = '/boot/config/plugins/dynamix/dynamix.cfg';
const AURORA_THEME_DIR = '/tmp/aurora-theme';
const AURORA_THEME_SNAPSHOT = AURORA_THEME_DIR . '/dynamix.cfg.json';
const AURORA_THEME_LOCK = AURORA_THEME_DIR . '/theme.lock';
// A snapshot older than this is not used to put keys back: the user may have changed things since.
const AURORA_SNAPSHOT_MAX_AGE = 120;

function aurora_fail(int $status, string $message): void
{
    http_response_code($status);
    echo json_encode(['error' => $message]);
    exit;
}

/** Reads dynamix.cfg as sections, retrying while another writer has it half written. */
function aurora_read_cfg(): ?array
{
    for ($try = 0; $try < 15; $try++) {
        clearstatcache(true, AURORA_DYNAMIX_CFG);
        $text = @file_get_contents(AURORA_DYNAMIX_CFG);
        if (is_string($text) && trim($text) !== '') {
            $parsed = @parse_ini_string($text, true, INI_SCANNER_RAW);
            if (is_array($parsed) && $parsed) return $parsed;
        }
        usleep(200000);
    }
    return null;
}

// Values are written back as read (INI_SCANNER_RAW), quoted like Unraid's own write_ini_file.
function aurora_ini_value($value): string
{
    return '"' . $value . '"';
}

/** Writes the sections in the layout Unraid uses, through a temporary file and a rename. */
function aurora_write_cfg(array $cfg): bool
{
    $loose = '';
    $sections = '';
    foreach ($cfg as $name => $value) {
        if (!is_array($value)) {
            $loose .= $name . '=' . aurora_ini_value($value) . "\n";
            continue;
        }
        $sections .= '[' . $name . "]\n";
        foreach ($value as $key => $item) {
            foreach (is_array($item) ? $item : [$item] as $index => $one) {
                $sections .= $key . (is_array($item) ? '[' . (is_int($index) ? '' : $index) . ']' : '') . '=' . aurora_ini_value($one) . "\n";
            }
        }
    }
    $temp = AURORA_DYNAMIX_CFG . '.aurora-tmp';
    if (file_put_contents($temp, $loose . $sections) === false) return false;
    if (!rename($temp, AURORA_DYNAMIX_CFG)) {
        @unlink($temp);
        return false;
    }
    return true;
}

/** Number of keys, counting each section's keys. */
function aurora_count_keys(array $cfg): int
{
    $count = 0;
    foreach ($cfg as $value) $count += is_array($value) ? count($value) : 1;
    return $count;
}

header('Content-Type: application/json');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') aurora_fail(405, 'POST only');
$theme = (string) ($_POST['theme'] ?? '');
$step = (string) ($_POST['step'] ?? 'save');
if (!in_array($theme, ['black', 'white'], true)) aurora_fail(400, 'theme must be black or white');
if (!in_array($step, ['save', 'verify'], true)) aurora_fail(400, 'step must be save or verify');

if (!is_dir(AURORA_THEME_DIR)) @mkdir(AURORA_THEME_DIR, 0700, true);
$lock = fopen(AURORA_THEME_LOCK, 'c');
if (!$lock || !flock($lock, LOCK_EX)) aurora_fail(500, 'could not lock ' . AURORA_THEME_LOCK);

$cfg = aurora_read_cfg();
if ($cfg === null) aurora_fail(503, 'dynamix.cfg could not be read, so nothing was changed');
if (isset($cfg['display']) && !is_array($cfg['display'])) aurora_fail(500, 'dynamix.cfg has no [display] section');

$restored = 0;
if ($step === 'save') {
    file_put_contents(AURORA_THEME_SNAPSHOT, json_encode(['time' => time(), 'cfg' => $cfg]));
} else {
    $snapshot = json_decode((string) @file_get_contents(AURORA_THEME_SNAPSHOT), true);
    if (is_array($snapshot) && is_array($snapshot['cfg'] ?? null) && time() - (int) ($snapshot['time'] ?? 0) <= AURORA_SNAPSHOT_MAX_AGE) {
        foreach ($snapshot['cfg'] as $name => $value) {
            if (!is_array($value)) {
                if (!array_key_exists($name, $cfg)) { $cfg[$name] = $value; $restored++; }
                continue;
            }
            if (!isset($cfg[$name]) || !is_array($cfg[$name])) $cfg[$name] = [];
            foreach ($value as $key => $item) {
                if (!array_key_exists($key, $cfg[$name])) { $cfg[$name][$key] = $item; $restored++; }
            }
        }
    }
    @unlink(AURORA_THEME_SNAPSHOT);
}

if ($restored === 0 && ($cfg['display']['theme'] ?? null) === $theme) {
    echo json_encode(['theme' => $theme, 'restored' => 0]);
    exit;
}

$before = aurora_count_keys($cfg) + (isset($cfg['display']['theme']) ? 0 : 1);
$cfg['display']['theme'] = $theme;
if (!aurora_write_cfg($cfg)) aurora_fail(500, 'could not write dynamix.cfg');

// Read back: the file must hold everything just written.
$check = aurora_read_cfg();
if ($check === null || aurora_count_keys($check) < $before || ($check['display']['theme'] ?? null) !== $theme) {
    aurora_fail(500, 'dynamix.cfg did not read back as written');
}
if ($restored) error_log("Aurora Theme: put back $restored dynamix.cfg settings lost while the theme changed");
echo json_encode(['theme' => $theme, 'restored' => $restored]);
