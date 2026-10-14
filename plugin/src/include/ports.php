<?php
// Ports that programs on the server listen on, for the port check in the Docker container editor.
//   GET  returns {"listening": [{"port": 445, "proto": "tcp", "process": "smbd"}, ...]}
// Docker's own forwarders (docker-proxy) are left out: the editor knows container ports already.

header('Content-Type: application/json');
header('Cache-Control: no-store');

$listening = [];
$seen = [];
exec('/usr/sbin/ss -H -l -n -t -u -p 2>/dev/null || ss -H -l -n -t -u -p 2>/dev/null', $lines);
foreach ($lines as $line) {
    // "tcp LISTEN 0 4096 0.0.0.0:445 0.0.0.0:* users:(("smbd",pid=1234,fd=40))"
    $fields = preg_split('/\s+/', trim($line));
    if (count($fields) < 5 || !preg_match('/:(\d+)$/', $fields[4], $match)) {
        continue;
    }
    $proto = $fields[0] === 'udp' ? 'udp' : 'tcp';
    $port = (int) $match[1];
    $process = preg_match('/users:\(\("([^"]+)"/', $line, $name) ? $name[1] : '';
    if ($process === 'docker-proxy' || isset($seen["$proto/$port"])) {
        continue;
    }
    $seen["$proto/$port"] = true;
    $listening[] = ['port' => $port, 'proto' => $proto, 'process' => $process];
}
usort($listening, function ($a, $b) { return $a['port'] <=> $b['port']; });
echo json_encode(['listening' => $listening]);
