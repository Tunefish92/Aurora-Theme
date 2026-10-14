<?php
// Processor counters for the Dashboard's processor tile, used when the Unraid API sends no
// figures. The page works out load and power from two readings, so nothing is kept here.
//   {"t": seconds, "total": [busy, all, user], "cpus": [[busy, all, user], ...],
//    "energy": [[microjoules, wraps at], ...] per package, "temps": [°C or null, ...] per package}

header('Content-Type: application/json');
header('Cache-Control: no-store');

$total = null;
$cpus = [];
foreach (@file('/proc/stat', FILE_IGNORE_NEW_LINES) ?: [] as $line) {
    // "cpu  user nice system idle iowait irq softirq steal ..." in jiffies since boot; the cpu lines come first.
    if (!preg_match('/^cpu(\d*)\s+(.*)$/', $line, $match)) {
        break;
    }
    $values = array_pad(array_map('floatval', array_slice(preg_split('/\s+/', trim($match[2])), 0, 8)), 8, 0.0);
    $all = array_sum($values);
    $counters = [$all - $values[3] - $values[4], $all, $values[0] + $values[1]];
    if ($match[1] === '') {
        $total = $counters;
    } else {
        $cpus[(int) $match[1]] = $counters;
    }
}
ksort($cpus);

// Package energy counters (Intel RAPL; recent kernels expose AMD packages the same way).
$energy = [];
$zones = glob('/sys/class/powercap/intel-rapl:*') ?: [];
natsort($zones);
foreach ($zones as $zone) {
    if (!preg_match('/intel-rapl:\d+$/', $zone)) {
        continue;
    }
    $used = @file_get_contents("$zone/energy_uj");
    $range = @file_get_contents("$zone/max_energy_range_uj");
    if ($used !== false && $range !== false) {
        $energy[] = [(float) trim($used), (float) trim($range)];
    }
}

// Package temperatures: coretemp "Package id N" (Intel), k10temp / zenpower Tdie or Tctl (AMD).
$temps = [];
$monitors = glob('/sys/class/hwmon/hwmon*') ?: [];
natsort($monitors);
foreach ($monitors as $monitor) {
    $name = trim((string) @file_get_contents("$monitor/name"));
    if (!in_array($name, ['coretemp', 'k10temp', 'zenpower'], true)) {
        continue;
    }
    $found = [];
    foreach (glob("$monitor/temp*_label") ?: [] as $labelFile) {
        $found[trim((string) @file_get_contents($labelFile))] = str_replace('_label', '_input', $labelFile);
    }
    $input = null;
    if ($name === 'coretemp') {
        foreach ($found as $label => $file) {
            if (preg_match('/^Package id (\d+)$/', $label, $match)) {
                $value = @file_get_contents($file);
                $temps[(int) $match[1]] = $value === false ? null : round((float) $value / 1000, 1);
            }
        }
        continue;
    }
    $input = $found['Tdie'] ?? $found['Tctl'] ?? (is_file("$monitor/temp1_input") ? "$monitor/temp1_input" : null);
    $value = $input ? @file_get_contents($input) : false;
    $temps[] = $value === false ? null : round((float) $value / 1000, 1);
}
ksort($temps);

echo json_encode([
    't' => microtime(true),
    'total' => $total,
    'cpus' => array_values($cpus),
    'energy' => $energy,
    'temps' => array_values($temps),
]);
