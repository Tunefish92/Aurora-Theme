<?php
// The accent colour from the plugin's settings, shared by every webGUI page (AuroraTheme.page)
// and the login page (login-head.php), so both follow the same colour.

/**
 * The accent colour setting ("#e11d48", "e11d48" or "#e1d") as a lower-case "#rrggbb", or ''
 * when it is empty or not a colour code: the theme's own blue stays then.
 */
function aurora_accent_hex($value): string
{
    $hex = strtolower(ltrim(trim((string) $value), '#'));
    if (preg_match('/^[0-9a-f]{3}$/', $hex)) {
        $hex = preg_replace('/(.)/', '$1$1', $hex);
    }
    return preg_match('/^[0-9a-f]{6}$/', $hex) ? "#$hex" : '';
}

/**
 * Relative luminance (WCAG) of a "#rrggbb" colour, 0 for black to 1 for white.
 */
function aurora_accent_luminance(string $hex): float
{
    $channels = [];
    foreach (str_split(ltrim($hex, '#'), 2) as $pair) {
        $value = hexdec($pair) / 255;
        $channels[] = $value <= 0.03928 ? $value / 12.92 : (($value + 0.055) / 1.055) ** 2.4;
    }
    return 0.2126 * $channels[0] + 0.7152 * $channels[1] + 0.0722 * $channels[2];
}

/**
 * Text colour on an accent background: white or near-black, whichever stands out more, so a
 * light accent (yellow, mint) still has readable button text.
 */
function aurora_accent_text(string $hex): string
{
    $light = aurora_accent_luminance($hex);
    $dark = aurora_accent_luminance('#06101f');
    return (1.05 / ($light + 0.05)) >= (($light + 0.05) / ($dark + 0.05)) ? '#ffffff' : '#06101f';
}
