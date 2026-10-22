<?php
// Application groups for the Docker tab, the VMs tab ("?type=vm") and the Dashboard.
//   GET                      returns {"groups": [{"name": "...", "containers": ["...", ...]}, ...]}
//   POST groups=<that JSON>  replaces the stored groups
// "containers" holds the members' names for both kinds.
// Unraid checks its csrf_token on every POST before this file runs, so writes can only come
// from a logged-in webGUI page. The groups live on the flash drive and survive reboots.

define('TFT_GROUPS_FILE', '/boot/config/plugins/Aurora-Theme/' . (($_GET['type'] ?? '') === 'vm' ? 'vm-groups.json' : 'docker-groups.json'));

/** Keeps only well-formed groups; a container can be in one group, the first that names it. */
function tft_clean_groups($groups): array
{
    $clean = [];
    $seenGroups = [];
    $seenContainers = [];
    foreach (is_array($groups) ? array_slice($groups, 0, 100) : [] as $group) {
        $name = is_array($group) && is_string($group['name'] ?? null) ? trim(mb_substr($group['name'], 0, 60)) : '';
        if ($name === '' || isset($seenGroups[mb_strtolower($name)])) {
            continue;
        }
        $seenGroups[mb_strtolower($name)] = true;
        $containers = [];
        foreach (is_array($group['containers'] ?? null) ? array_slice($group['containers'], 0, 500) : [] as $container) {
            if (!is_string($container) || $container === '' || strlen($container) > 128 || isset($seenContainers[$container])) {
                continue;
            }
            $seenContainers[$container] = true;
            $containers[] = $container;
        }
        $clean[] = ['name' => $name, 'containers' => $containers];
    }
    return $clean;
}

header('Content-Type: application/json');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $input = json_decode((string) ($_POST['groups'] ?? ''), true);
    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['error' => 'groups must be a JSON list']);
        exit;
    }
    $groups = tft_clean_groups($input);
    if (!is_dir(dirname(TFT_GROUPS_FILE))) {
        mkdir(dirname(TFT_GROUPS_FILE), 0755, true);
    }
    if (file_put_contents(TFT_GROUPS_FILE, json_encode(['groups' => $groups], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n", LOCK_EX) === false) {
        http_response_code(500);
        echo json_encode(['error' => 'could not write ' . TFT_GROUPS_FILE]);
        exit;
    }
    echo json_encode(['groups' => $groups]);
    exit;
}

$stored = json_decode((string) @file_get_contents(TFT_GROUPS_FILE), true);
echo json_encode(['groups' => tft_clean_groups($stored['groups'] ?? [])]);
