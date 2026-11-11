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
    // The accent colour from the settings, as on every other page: buttons, logo tile and the
    // background glow follow it, with readable text on a light accent. Plain :root rules, as
    // weak as login.css's own, so custom-login.css below still wins. The shades are mixed from
    // var(--tp-primary), so a custom-login.css that only sets --tp-primary recolours them too.
    @include_once "$dir/include/accent.php";
    $accent = function_exists('aurora_accent_hex') ? aurora_accent_hex($cfg['accent'] ?? '') : '';
    if ($accent !== '') {
        $soft = function (int $percent): string {
            return "color-mix(in srgb, var(--tp-primary) $percent%, transparent)";
        };
        echo '<style id="aurora-login-accent">' . "\n"
            . ":root { --tp-primary: $accent; --tp-primary-ii: color-mix(in oklab, var(--tp-primary) 62%, white);"
            . ' --tp-primary-text: ' . aurora_accent_text($accent) . ';'
            . ' --tp-primary-soft: ' . $soft(18) . '; --tp-aurora-a: ' . $soft(35) . ';'
            . " --tp-aurora-b: color-mix(in srgb, var(--tp-primary-ii) 22%, transparent); }\n"
            . ':root:where(.Theme--white, .Theme--azure) { --tp-primary-soft: ' . $soft(12) . '; --tp-aurora-a: ' . $soft(22) . ';'
            . " --tp-aurora-b: color-mix(in srgb, var(--tp-primary-ii) 18%, transparent); }\n"
            . "</style>\n";
    }
    // The user's own rules for this page, after the theme's (#35): the login page's colours are
    // variables (--tp-primary, --tp-bg, --tp-card, ...), so a few lines can match it to custom.css.
    // Only CSS: no script of the user's runs on the page where the password is typed.
    $custom = @file_get_contents('/boot/config/plugins/Aurora-Theme/custom-login.css');
    if ($custom !== false && trim($custom) !== '') {
        echo '<style id="aurora-custom-login-css">' . "\n" . str_ireplace('</style', '<\/style', $custom) . "\n</style>\n";
    }
    // "Successfully logged out" is shown with the error style; it gets the calm one instead.
    echo "<script>document.addEventListener('DOMContentLoaded', function () {\n"
        . "  var note = document.getElementById('error');\n"
        . "  if (note && /logged out|abgemeldet/i.test(note.textContent)) note.classList.add('tp-ok');\n"
        . "});</script>\n";
})();
