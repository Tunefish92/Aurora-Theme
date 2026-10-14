<?php
// Aurora Theme on the login page. The plugin's install script adds one line to Unraid's login
// page (.login.php, and the first-time password page) that includes this file just before
// </head>. Files below /plugins are not served before login, so the stylesheet and two fonts
// are written into the page. Nothing is written when the theme is off, when ?aurora=off is
// used, or when a file is missing, so the stock login page always remains.
(function () {
    $dir = '/usr/local/emhttp/plugins/Aurora-Theme';
    $cfg = array_merge((array) @parse_ini_file("$dir/default.cfg"), (array) @parse_ini_file('/boot/config/plugins/Aurora-Theme/Aurora-Theme.cfg'));
    if (($cfg['theme'] ?? 'yes') !== 'yes') {
        return;
    }
    // The same emergency switch as on every other page.
    $switch = $_GET['aurora'] ?? '';
    if ($switch === 'off') {
        echo "<script>document.cookie = 'aurora_off=1; path=/; max-age=31536000; SameSite=Lax';</script>\n";
        return;
    }
    if ($switch === 'on') {
        echo "<script>document.cookie = 'aurora_off=; path=/; max-age=0; SameSite=Lax';</script>\n";
    } elseif (!empty($_COOKIE['aurora_off'])) {
        return;
    }
    $css = @file_get_contents("$dir/styles/login.css");
    if ($css === false) {
        return;
    }
    $font = function (string $file) use ($dir): string {
        $data = @file_get_contents("$dir/fonts/$file");
        return $data === false ? '' : 'data:font/woff2;base64,' . base64_encode($data);
    };
    $css = str_replace(
        ['@@INTER@@', '@@GROTESK@@'],
        [$font('inter-latin-wght-normal.woff2'), $font('space-grotesk-latin-wght-normal.woff2')],
        $css
    );
    echo '<style id="aurora-login">' . "\n" . str_ireplace('</style', '<\/style', $css) . "\n</style>\n";
    // "Successfully logged out" is shown with the error style; it gets the calm one instead.
    echo "<script>document.addEventListener('DOMContentLoaded', function () {\n"
        . "  var note = document.getElementById('error');\n"
        . "  if (note && /logged out|abgemeldet/i.test(note.textContent)) note.classList.add('tp-ok');\n"
        . "});</script>\n";
})();
