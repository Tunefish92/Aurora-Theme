<?php
// Checks GroupIconsLib.php (#40): which icon values are accepted, which images are stored, that
// the same image is stored once, and that pruning removes only unused, older uploads. Uses a
// temporary directory, never the flash drive.
//
// Usage: php plugin/test/group_icons_lib.php   (exits with 1 on a failure)

require __DIR__ . '/../src/include/GroupIconsLib.php';

$failures = 0;

/**
 * Prints one check's result and counts a failure.
 */
function check(string $label, bool $passed): void
{
    global $failures;
    echo ($passed ? 'ok   ' : 'FAIL ') . $label . "\n";
    if (!$passed) {
        $failures++;
    }
}

// 1 × 1 pixel images.
$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
$gif = base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
$webp = base64_decode('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA');
$svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><script>alert(1)</script></svg>';

$valid = [
    'fa-film', 'fa-hdd-o', 'upload:' . str_repeat('a', 40) . '.png',
    '/state/plugins/dynamix.docker.manager/images/fixture-app-1-icon.png?1700000000',
    '/plugins/dynamix.vm.manager/templates/images/windows.png', '/plugins/dynamix.docker.manager/images/question.png',
];
foreach ($valid as $icon) {
    check("accepted: $icon", aurora_group_icon_valid($icon));
}
$invalid = [
    '', null, 42, ['fa-film'], 'fa-', 'fa-Film', 'fa-film"><script>', 'fa film', 'film',
    'http://example.com/icon.png', 'https://example.com/icon.png', '//example.com/icon.png', 'javascript:alert(1)',
    '/plugins/../../etc/passwd.png', '/plugins/a//b.png', '/plugins/icon.php', '/plugins/icon.png?x=<b>', '/plugins/icon png.png',
    'upload:' . str_repeat('a', 39) . '.png', 'upload:' . str_repeat('a', 40) . '.svg', 'upload:../x.png',
    'data:image/png;base64,' . base64_encode($png), str_repeat('/a', 200) . '.png',
];
foreach ($invalid as $icon) {
    check('refused: ' . (is_string($icon) ? substr($icon, 0, 60) : gettype($icon)), !aurora_group_icon_valid($icon));
}

check('file of an upload value', aurora_group_icon_file('upload:' . str_repeat('b', 40) . '.gif') === str_repeat('b', 40) . '.gif');
check('no file for other values', aurora_group_icon_file('fa-film') === '' && aurora_group_icon_file('/x.png') === '');

check('PNG accepted', aurora_group_icon_check($png) === ['png', '']);
check('GIF accepted', aurora_group_icon_check($gif) === ['gif', '']);
check('WebP accepted', aurora_group_icon_check($webp) === ['webp', '']);
check('SVG refused', aurora_group_icon_check($svg)[0] === '');
check('text refused', aurora_group_icon_check('<?php echo 1;')[0] === '');
check('empty refused', aurora_group_icon_check('')[0] === '');
check('over 1 MB refused', aurora_group_icon_check($png . str_repeat("\0", AURORA_GROUP_ICON_MAX_BYTES))[0] === '');

$dir = sys_get_temp_dir() . '/aurora-group-icons-' . bin2hex(random_bytes(4));
[$icon, $error] = aurora_group_icon_store($png, "$dir/icons");
check('PNG stored', $error === '' && $icon === 'upload:' . sha1($png) . '.png' && is_file("$dir/icons/" . sha1($png) . '.png'));
[$again] = aurora_group_icon_store($png, "$dir/icons");
check('same image stored once', $again === $icon && count(glob("$dir/icons/*")) === 1);
[$none, $refused] = aurora_group_icon_store($svg, "$dir/icons");
check('SVG not stored', $none === '' && $refused !== '' && count(glob("$dir/icons/*")) === 1);

[$gifIcon] = aurora_group_icon_store($gif, "$dir/icons");
[$webpIcon] = aurora_group_icon_store($webp, "$dir/icons");
file_put_contents("$dir/docker-groups.json", json_encode(['groups' => [['name' => 'Media', 'containers' => [], 'icon' => $icon]]]));
file_put_contents("$dir/vm-groups.json", json_encode(['groups' => [['name' => 'Desktops', 'containers' => [], 'icon' => $gifIcon]]]));
touch("$dir/icons/" . aurora_group_icon_file($webpIcon), time() - 7200);
touch("$dir/icons/" . aurora_group_icon_file($icon), time() - 7200);
aurora_group_icons_prune(["$dir/docker-groups.json", "$dir/vm-groups.json"], "$dir/icons");
check('prune keeps the icons groups use', is_file("$dir/icons/" . aurora_group_icon_file($icon)) && is_file("$dir/icons/" . aurora_group_icon_file($gifIcon)));
check('prune removes an old unused icon', !is_file("$dir/icons/" . aurora_group_icon_file($webpIcon)));
[$webpIcon] = aurora_group_icon_store($webp, "$dir/icons");
aurora_group_icons_prune(["$dir/docker-groups.json", "$dir/vm-groups.json"], "$dir/icons");
check('prune keeps a fresh upload', is_file("$dir/icons/" . aurora_group_icon_file($webpIcon)));

check('download refuses other schemes', aurora_group_icon_download('file:///etc/passwd')[1] !== '' && aurora_group_icon_download('ftp://example.com/a.png')[1] !== '');
check('download refuses no host', aurora_group_icon_download('http:///a.png')[1] !== '');

array_map('unlink', glob("$dir/icons/*") ?: []);
@rmdir("$dir/icons");
array_map('unlink', glob("$dir/*.json") ?: []);
@rmdir($dir);

echo $failures ? "$failures failed\n" : "all passed\n";
exit($failures ? 1 : 0);
