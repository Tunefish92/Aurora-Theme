<?php
// When Unraid's record of container image updates last changed, for the Docker tab and the
// Dashboard: they reload their container list when it changes while they are open. Unraid writes
// the record when it checks for updates and when it updates a container, also in the background
// (CA Auto Update, "Update All" in another tab), which would otherwise leave "update ready"
// showing until the page is reloaded.
//   GET   {"stamp": "modification time-size", "busy": bool}; stamp "" while there is no record
//         (Docker not started)
// "busy": a check or an update may still be running. The record is written once per image while
// a check goes through them, and the check saves its results to Unraid's list cache only at the
// end; a list loaded in between shows half the results and can write the old ones back over
// them. Busy while Unraid's scheduled check or an update runs, and for a few seconds after each
// write to the record (a check started from a page runs inside the web server, where it has no
// process of its own).

header('Content-Type: application/json');
header('Cache-Control: no-store');

$file = '/var/lib/docker/unraid-update-status.json';
clearstatcache(true, $file);
$stat = @stat($file);
$busy = $stat && time() - $stat['mtime'] < 10;
if (!$busy) {
    // The brackets keep pgrep from finding the shell that runs it.
    exec("pgrep -f '[d]ynamix.docker.manager/scripts/(dockerupdate|update_container)'", $running);
    $busy = !empty($running);
}
echo json_encode(['stamp' => $stat ? $stat['mtime'] . '-' . $stat['size'] : '', 'busy' => $busy]);
