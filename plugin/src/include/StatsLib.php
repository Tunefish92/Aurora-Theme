<?php
// Shared by the collector (scripts/collect.php, run by cron every minute) and the JSON endpoint
// (include/stats.php). Samples come straight from /proc, so no other plugin or package is needed.
// History lives in RAM under TFT_STATS_DIR, one CSV file per UTC day, and is lost on reboot.

const TFT_PLUGIN = 'Aurora-Theme';
const TFT_STATS_DIR = '/var/lib/aurora-theme';
const TFT_STATS_KEEP_DAYS = 31;

function tft_stats_enabled(): bool
{
    $cfg = [];
    foreach (['/usr/local/emhttp/plugins/' . TFT_PLUGIN . '/default.cfg', '/boot/config/plugins/' . TFT_PLUGIN . '/' . TFT_PLUGIN . '.cfg'] as $file) {
        if (is_file($file)) {
            $cfg = array_merge($cfg, @parse_ini_file($file) ?: []);
        }
    }
    return ($cfg['stats'] ?? 'yes') == 'yes';
}

/** Raw counters at one moment; two of these make a rate. */
function tft_stats_sample(): array
{
    // "cpu user nice system idle iowait irq softirq steal ..." in jiffies since boot
    $cpu = preg_split('/\s+/', trim((string) strtok((string) @file_get_contents('/proc/stat'), "\n")));
    $cpu = array_pad(array_map('floatval', array_slice($cpu, 1, 8)), 8, 0.0);
    $total = array_sum($cpu);
    $idle = $cpu[3] + $cpu[4];

    $mem = ['MemTotal' => 0.0, 'MemAvailable' => 0.0];
    foreach (@file('/proc/meminfo') ?: [] as $line) {
        if (preg_match('/^(MemTotal|MemAvailable):\s+(\d+)/', $line, $match)) {
            $mem[$match[1]] = (float) $match[2];
        }
    }

    // Physical network cards only: bonds, bridges and container interfaces carry the same
    // traffic again and would double it.
    $rx = $tx = 0.0;
    foreach (@file('/proc/net/dev') ?: [] as $line) {
        if (!preg_match('/^\s*([^:\s]+):\s*(.+)$/', $line, $match) || !file_exists("/sys/class/net/{$match[1]}/device")) {
            continue;
        }
        $fields = preg_split('/\s+/', trim($match[2]));
        $rx += (float) ($fields[0] ?? 0);
        $tx += (float) ($fields[8] ?? 0);
    }

    // Whole disks only, not their partitions. Sector counts are always in 512-byte units.
    $read = $written = 0.0;
    foreach (@file('/proc/diskstats') ?: [] as $line) {
        $fields = preg_split('/\s+/', trim($line));
        if (!preg_match('/^(sd[a-z]+|nvme\d+n\d+|vd[a-z]+|xvd[a-z]+|mmcblk\d+)$/', $fields[2] ?? '')) {
            continue;
        }
        $read += (float) ($fields[5] ?? 0) * 512;
        $written += (float) ($fields[9] ?? 0) * 512;
    }

    return [
        't' => microtime(true),
        'busy' => $total - $idle,
        'total' => $total,
        'mem' => $mem['MemTotal'] > 0 ? (1 - $mem['MemAvailable'] / $mem['MemTotal']) * 100 : 0.0,
        'rx' => $rx,
        'tx' => $tx,
        'rd' => $read,
        'wr' => $written,
    ];
}

/** One history point: [unix time, cpu %, memory %, rx B/s, tx B/s, read B/s, write B/s]. */
function tft_stats_rates(array $from, array $to): ?array
{
    $seconds = $to['t'] - $from['t'];
    if ($seconds <= 0) {
        return null;
    }
    $jiffies = $to['total'] - $from['total'];
    $cpu = $jiffies > 0 ? max(0, min(100, ($to['busy'] - $from['busy']) / $jiffies * 100)) : 0;
    // Counters restart from zero after a reboot; a negative difference means "no data", not traffic.
    $rate = fn(string $key) => (int) round(max(0, ($to[$key] - $from[$key]) / $seconds));
    return [(int) round($to['t']), round($cpu, 1), round($to['mem'], 1), $rate('rx'), $rate('tx'), $rate('rd'), $rate('wr')];
}

/** Stored points between two times, averaged into at most $maxPoints buckets. */
function tft_stats_history(int $start, int $end, int $maxPoints = 240): array
{
    $bucketSeconds = max(60, (int) ceil(($end - $start) / $maxPoints));
    $buckets = [];
    for ($day = strtotime(gmdate('Y-m-d', $start) . ' UTC'); $day <= $end; $day += 86400) {
        $file = TFT_STATS_DIR . '/' . gmdate('Ymd', $day) . '.csv';
        $handle = is_file($file) ? @fopen($file, 'r') : false;
        if (!$handle) {
            continue;
        }
        while (($row = fgetcsv($handle, 200, ',', '"', '')) !== false) {
            if (count($row) < 7 || $row[0] < $start || $row[0] > $end) {
                continue;
            }
            $index = intdiv((int) $row[0] - $start, $bucketSeconds);
            $buckets[$index] ??= ['n' => 0, 'time' => 0.0, 'sum' => array_fill(0, 6, 0.0)];
            $buckets[$index]['n']++;
            $buckets[$index]['time'] += (float) $row[0];
            for ($column = 0; $column < 6; $column++) {
                $buckets[$index]['sum'][$column] += (float) $row[$column + 1];
            }
        }
        fclose($handle);
    }
    ksort($buckets);
    $points = [];
    foreach ($buckets as $bucket) {
        // The mean sample time, so a half-filled latest bucket is not drawn in the future.
        $point = [(int) round($bucket['time'] / $bucket['n'])];
        foreach ($bucket['sum'] as $sum) {
            $point[] = round($sum / $bucket['n'], 1);
        }
        $points[] = $point;
    }
    return $points;
}
