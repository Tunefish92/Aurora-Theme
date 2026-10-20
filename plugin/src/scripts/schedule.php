#!/usr/bin/php
<?php
// Writes the cron entry for automatic updates (autoupdate.cron on the flash drive, from which
// Unraid builds its crontab) for the time chosen on the settings page, and reloads the crontab.
// Run by the plugin's install script, so also at every boot, and by the settings page after its
// form is saved. With automatic updates off, the entry is left out.
require '/usr/local/emhttp/plugins/Aurora-Theme/include/UpdateLib.php';

$schedule = aurora_update_schedule();
$entry = '# Aurora Theme: check for a newer release on GitHub and install it, ' . $schedule['text'] . "\n";
if (aurora_setting('autoupdate') === 'yes') {
    $entry .= $schedule['cron'] . ' /usr/bin/php /usr/local/emhttp/plugins/' . AURORA_PLUGIN . "/scripts/autoupdate.php &> /dev/null\n";
}
file_put_contents('/boot/config/plugins/' . AURORA_PLUGIN . '/autoupdate.cron', $entry . "\n");
exec('/usr/local/sbin/update_cron');
