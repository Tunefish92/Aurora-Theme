<?php
// JSON for the Stats page: /plugins/Aurora-Theme/include/stats.php?range=hour|day|week|month|live
require __DIR__ . '/StatsLib.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');

$range = $_GET['range'] ?? 'hour';

if ($range === 'live') {
    // Two samples one second apart give the current rates without waiting for the collector.
    $first = tft_stats_sample();
    usleep(1000000);
    $point = tft_stats_rates($first, tft_stats_sample());
    echo json_encode(['range' => 'live', 'points' => $point ? [$point] : []]);
    exit;
}

$spans = ['hour' => 3600, 'day' => 86400, 'week' => 7 * 86400, 'month' => 31 * 86400];
if (!isset($spans[$range])) {
    $range = 'hour';
}
$end = time();
$start = $end - $spans[$range];
echo json_encode(['range' => $range, 'start' => $start, 'end' => $end, 'points' => tft_stats_history($start, $end)]);
