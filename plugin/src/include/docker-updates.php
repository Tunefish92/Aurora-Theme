<?php
// When Unraid's record of container image updates last changed, for the Docker tab and the
// Dashboard: they reload their container list when it changes while they are open. Unraid writes
// the record when it checks for updates and when it updates a container, also in the background
// (CA Auto Update, "Update All" in another tab), which would otherwise leave "update ready"
// showing until the page is reloaded.
//   GET   {"stamp": "modification time-size"}, "" while there is no record (Docker not started)

header('Content-Type: application/json');
header('Cache-Control: no-store');

$file = '/var/lib/docker/unraid-update-status.json';
clearstatcache(true, $file);
$stat = @stat($file);
echo json_encode(['stamp' => $stat ? $stat['mtime'] . '-' . $stat['size'] : '']);
