<?php

/**
 * Icons of the application groups (Docker and VMs tabs, Dashboard), issue #40.
 *
 * A group's "icon" is one of:
 *   fa-<name>               a Font Awesome 4 icon (Unraid ships the font)
 *   /<path>.<png|jpg|...>   an image already on this server, such as a container's or VM's icon
 *   upload:<sha1>.<ext>     an image uploaded from the PC or fetched from a URL, kept on the flash
 *                           drive in AURORA_GROUP_ICON_DIR and served by group-icons.php
 * Anything else is dropped, so the browser only ever gets a class name or a same-server path.
 * Uploaded files are checked by their content (PNG, JPEG, GIF or WebP; SVG is refused, since it
 * could carry script), named by their SHA-1 so the same image is stored once, and removed once no
 * group uses them.
 */

const AURORA_GROUP_ICON_DIR = '/boot/config/plugins/Aurora-Theme/group-icons';
const AURORA_GROUP_ICON_MAX_BYTES = 1048576;
const AURORA_GROUP_ICON_MAX_SIDE = 2048;
const AURORA_GROUP_ICON_TYPES = [IMAGETYPE_PNG => 'png', IMAGETYPE_JPEG => 'jpg', IMAGETYPE_GIF => 'gif', IMAGETYPE_WEBP => 'webp'];
const AURORA_GROUP_ICON_MIME = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'gif' => 'image/gif', 'webp' => 'image/webp'];

/**
 * Whether a stored icon value has one of the three accepted forms; '' (no icon) is not valid.
 */
function aurora_group_icon_valid($icon): bool
{
    if (!is_string($icon) || $icon === '' || strlen($icon) > 300) {
        return false;
    }
    if (preg_match('/^fa-[a-z0-9-]{1,40}$/', $icon)) {
        return true;
    }
    if (preg_match('/^upload:[0-9a-f]{40}\.(png|jpg|gif|webp)$/', $icon)) {
        return true;
    }
    // A path on this server: no scheme, no host, no "..", an image file, an optional plain query.
    return (bool) preg_match('#^/(?!/)[A-Za-z0-9._~%+/-]+\.(png|jpe?g|gif|webp|svg|ico)(\?[A-Za-z0-9=&._-]{0,80})?$#i', $icon)
        && !preg_match('#(^|/)\.\.(/|$)|//#', $icon);
}

/**
 * The file name of an uploaded icon ("<sha1>.<ext>") from its icon value, or '' when it is not one.
 */
function aurora_group_icon_file(string $icon): string
{
    return preg_match('/^upload:([0-9a-f]{40}\.(png|jpg|gif|webp))$/', $icon, $match) ? $match[1] : '';
}

/**
 * Checks image bytes (size, type by content, dimensions) and returns the file extension to store
 * them under, or an error message for the user.
 *
 * @return array{0: string, 1: string} [extension, error]; exactly one is non-empty
 */
function aurora_group_icon_check(string $bytes): array
{
    if ($bytes === '') {
        return ['', 'The file is empty.'];
    }
    if (strlen($bytes) > AURORA_GROUP_ICON_MAX_BYTES) {
        return ['', 'The image is larger than 1 MB.'];
    }
    $info = @getimagesizefromstring($bytes);
    if (!is_array($info) || !isset(AURORA_GROUP_ICON_TYPES[$info[2]])) {
        return ['', 'This is not a PNG, JPEG, GIF or WebP image.'];
    }
    if ($info[0] < 1 || $info[1] < 1 || $info[0] > AURORA_GROUP_ICON_MAX_SIDE || $info[1] > AURORA_GROUP_ICON_MAX_SIDE) {
        return ['', 'The image must be at most 2048 × 2048 pixels.'];
    }
    return [AURORA_GROUP_ICON_TYPES[$info[2]], ''];
}

/**
 * Stores checked image bytes in $dir under their SHA-1 and returns [icon value, error]. The same
 * image uploaded twice is one file.
 *
 * @return array{0: string, 1: string}
 */
function aurora_group_icon_store(string $bytes, string $dir = AURORA_GROUP_ICON_DIR): array
{
    [$extension, $error] = aurora_group_icon_check($bytes);
    if ($error !== '') {
        return ['', $error];
    }
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
        return ['', 'Could not create ' . $dir . '.'];
    }
    $name = sha1($bytes) . '.' . $extension;
    if (!is_file("$dir/$name") && @file_put_contents("$dir/$name", $bytes, LOCK_EX) === false) {
        return ['', 'Could not save the image on the flash drive.'];
    }
    return ['upload:' . $name, ''];
}

/**
 * Downloads an image for a group icon from an http or https URL, at most 1 MB, following at most
 * three redirects. Returns [bytes, error].
 *
 * @return array{0: string, 1: string}
 */
function aurora_group_icon_download(string $url): array
{
    $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
    if (!in_array($scheme, ['http', 'https'], true) || !parse_url($url, PHP_URL_HOST) || strlen($url) > 2000) {
        return ['', 'Enter a web address that starts with http:// or https://.'];
    }
    if (!function_exists('curl_init')) {
        return ['', 'Downloading is not available on this server.'];
    }
    $bytes = '';
    $tooLarge = false;
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_USERAGENT => 'Aurora-Theme (Unraid plugin)',
        CURLOPT_FAILONERROR => true,
        CURLOPT_WRITEFUNCTION => function ($handle, string $chunk) use (&$bytes, &$tooLarge): int {
            $bytes .= $chunk;
            if (strlen($bytes) > AURORA_GROUP_ICON_MAX_BYTES) {
                $tooLarge = true;
                return 0;
            }
            return strlen($chunk);
        },
    ]);
    $ok = curl_exec($curl);
    $message = curl_error($curl);
    curl_close($curl);
    if ($tooLarge) {
        return ['', 'The image is larger than 1 MB.'];
    }
    if ($ok === false) {
        return ['', 'The image could not be downloaded' . ($message !== '' ? ' (' . $message . ').' : '.')];
    }
    return [$bytes, ''];
}

/**
 * The uploaded icon files the stored Docker and VM groups use.
 *
 * @param string[] $groupFiles paths of the groups JSON files
 * @return array<string, true> file name => true
 */
function aurora_group_icons_in_use(array $groupFiles): array
{
    $used = [];
    foreach ($groupFiles as $groupFile) {
        $stored = json_decode((string) @file_get_contents($groupFile), true);
        foreach (is_array($stored['groups'] ?? null) ? $stored['groups'] : [] as $group) {
            $file = is_array($group) && is_string($group['icon'] ?? null) ? aurora_group_icon_file($group['icon']) : '';
            if ($file !== '') {
                $used[$file] = true;
            }
        }
    }
    return $used;
}

/**
 * Deletes uploaded icons no group uses any more. Files younger than $graceSeconds stay: they may
 * have just been uploaded for a group that is about to be saved.
 *
 * @param string[] $groupFiles paths of the groups JSON files
 */
function aurora_group_icons_prune(array $groupFiles, string $dir = AURORA_GROUP_ICON_DIR, int $graceSeconds = 3600): void
{
    $used = aurora_group_icons_in_use($groupFiles);
    foreach (glob("$dir/*.{png,jpg,gif,webp}", GLOB_BRACE) ?: [] as $path) {
        if (!isset($used[basename($path)]) && filemtime($path) < time() - $graceSeconds) {
            @unlink($path);
        }
    }
}
