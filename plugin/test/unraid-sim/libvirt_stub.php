<?php
// Fake libvirt PHP extension for the fake Unraid server: the libvirt_* functions Unraid's
// Libvirt class (dynamix.vm.manager/include/libvirt.php) calls, answering from
// /tmp/sim/vms.json (written by scenario.mjs) with each VM as libvirt domain XML. Start,
// stop, pause and resume change that file. Anything not modelled answers false.
if (extension_loaded('libvirt')) return;

const LIBVIRT_STUB_FILE = '/tmp/sim/vms.json';
foreach (['VIR_DOMAIN_XML_INACTIVE' => 2, 'VIR_CRED_AUTHNAME' => 2, 'VIR_CRED_PASSPHRASE' => 5, 'VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_AGENT' => 1,
    'VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_LEASE' => 0, 'VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_ARP' => 2, 'VIR_DOMAIN_START_PAUSED' => 1,
    'VIR_DOMAIN_NOSTATE' => 0, 'VIR_DOMAIN_RUNNING' => 1, 'VIR_DOMAIN_BLOCKED' => 2, 'VIR_DOMAIN_PAUSED' => 3, 'VIR_DOMAIN_SHUTDOWN' => 4,
    'VIR_DOMAIN_SHUTOFF' => 5, 'VIR_DOMAIN_CRASHED' => 6, 'VIR_DOMAIN_PMSUSPENDED' => 7, 'VIR_DOMAIN_DEVICE_MODIFY_LIVE' => 1,
    'VIR_DOMAIN_DEVICE_MODIFY_CONFIG' => 2, 'VIR_NETWORKS_ACTIVE' => 1, 'VIR_NETWORKS_INACTIVE' => 2, 'VIR_NETWORKS_ALL' => 3,
    'VIR_DOMAIN_UNDEFINE_NVRAM' => 4, 'VIR_DOMAIN_UNDEFINE_KEEP_NVRAM' => 8, 'VIR_DOMAIN_UNDEFINE_SNAPSHOTS_METADATA' => 2] as $name => $value) {
    if (!defined($name)) define($name, $value);
}

// Domains are resources, as libvirt's are (Unraid uses them as array keys and checks
// is_resource()): a memory stream per domain, mapped to the VM's name.
$GLOBALS['libvirtStubHandles'] = [];
function libvirt_stub_handle($name) {
    foreach ($GLOBALS['libvirtStubHandles'] as $handle) if ($handle[1] === $name) return $handle[0];
    $resource = fopen('php://memory', 'r');
    $GLOBALS['libvirtStubHandles'][(int)$resource] = [$resource, $name];
    return $resource;
}
function libvirt_stub_name($dom) {
    if (is_resource($dom)) return $GLOBALS['libvirtStubHandles'][(int)$dom][1] ?? null;
    return (string)$dom;
}

function libvirt_stub_vms() {
    $data = @json_decode(@file_get_contents(LIBVIRT_STUB_FILE), true);
    return is_array($data['vms'] ?? null) ? $data['vms'] : [];
}
function libvirt_stub_vm($dom) {
    $name = libvirt_stub_name($dom);
    foreach (libvirt_stub_vms() as $index => $vm) if ($vm['name'] === $name || $vm['uuid'] === $name) return $vm + ['index' => $index];
    return null;
}
function libvirt_stub_set($dom, $changes) {
    $data = @json_decode(@file_get_contents(LIBVIRT_STUB_FILE), true) ?: ['vms' => []];
    $name = libvirt_stub_name($dom);
    foreach ($data['vms'] as &$vm) if ($vm['name'] === $name) $vm = array_merge($vm, $changes);
    file_put_contents(LIBVIRT_STUB_FILE, json_encode($data));
    return true;
}
function libvirt_stub_xml($vm) {
    $mem = (int)($vm['memoryKiB'] ?? 4194304);
    $name = htmlspecialchars($vm['name']);
    $desc = htmlspecialchars($vm['description'] ?? '');
    $icon = htmlspecialchars($vm['icon'] ?? 'windows.png');
    $vcpus = (int)($vm['vcpus'] ?? 2);
    $disks = '';
    foreach (($vm['disks'] ?? ["/mnt/user/domains/{$vm['name']}/vdisk1.img"]) as $i => $file) {
        $dev = 'hd' . chr(ord('c') + $i);
        $disks .= "<disk type='file' device='disk'><driver name='qemu' type='raw' cache='writeback'/><source file='" . htmlspecialchars($file) . "'/><target dev='$dev' bus='virtio'/><boot order='" . ($i + 1) . "'/></disk>";
    }
    $graphics = ($vm['graphics'] ?? 'vnc') === 'none' ? '' : "<graphics type='vnc' port='" . (5900 + $vm['index']) . "' autoport='yes' websocket='" . (5700 + $vm['index']) . "' listen='0.0.0.0' keymap='en-us'><listen type='address' address='0.0.0.0'/></graphics>";
    $mac = sprintf('52:54:00:00:00:%02x', $vm['index'] % 256);
    return "<domain type='kvm'" . (!empty($vm['running']) ? " id='" . ($vm['index'] + 1) . "'" : '') . "><name>$name</name><uuid>{$vm['uuid']}</uuid><description>$desc</description>"
        . "<metadata><vmtemplate xmlns='unraid' name='Windows 10' icon='$icon' os='windows10'/></metadata>"
        . "<memory unit='KiB'>$mem</memory><currentMemory unit='KiB'>$mem</currentMemory><memoryBacking><nosharepages/></memoryBacking>"
        . "<vcpu placement='static'>$vcpus</vcpu><cputune>" . implode('', array_map(fn($c) => "<vcpupin vcpu='$c' cpuset='$c'/>", range(0, $vcpus - 1))) . "</cputune>"
        . "<os><type arch='x86_64' machine='pc-q35-9.2'>hvm</type><loader readonly='yes' type='pflash'>/usr/share/qemu/ovmf-x64/OVMF_CODE-pure-efi.fd</loader><nvram>/etc/libvirt/qemu/nvram/{$vm['uuid']}_VARS-pure-efi.fd</nvram></os>"
        . "<features><acpi/><apic/></features><cpu mode='host-passthrough' check='none' migratable='on'><topology sockets='1' dies='1' clusters='1' cores='$vcpus' threads='1'/></cpu>"
        . "<clock offset='localtime'/><on_poweroff>destroy</on_poweroff><on_reboot>restart</on_reboot><on_crash>restart</on_crash>"
        . "<devices><emulator>/usr/local/sbin/qemu</emulator>$disks"
        . "<interface type='bridge'><mac address='$mac'/><source bridge='br0'/><model type='virtio-net'/></interface>"
        . "<serial type='pty'><target type='isa-serial' port='0'><model name='isa-serial'/></target></serial><console type='pty'><target type='serial' port='0'/></console>"
        . "<channel type='unix'><target type='virtio' name='org.qemu.guest_agent.0'/></channel>"
        . "<input type='tablet' bus='usb'/><input type='mouse' bus='ps2'/><input type='keyboard' bus='ps2'/>$graphics"
        . "<video><model type='qxl' ram='65536' vram='65536' vgamem='16384' heads='1' primary='yes'/></video><memballoon model='none'/></devices></domain>";
}

// Connecting also writes each VM's definition where libvirt keeps it (the VM editor reads it).
function libvirt_connect($uri = null, $readonly = false, $credentials = []) {
    @mkdir('/etc/libvirt/qemu', 0755, true);
    foreach (libvirt_stub_vms() as $index => $vm) @file_put_contents("/etc/libvirt/qemu/{$vm['name']}.xml", libvirt_stub_xml($vm + ['index' => $index]));
    return 'libvirt-stub-connection';
}
function libvirt_get_last_error() { return ''; }
function libvirt_logfile_set(...$args) { return true; }
function libvirt_has_feature($name) { return false; }
function libvirt_connect_get_hostname($conn) { return 'Tower'; }
function libvirt_connect_get_uri($conn) { return 'qemu:///system'; }
function libvirt_connect_get_information($conn) { return ['uri' => 'qemu:///system', 'hostname' => 'Tower', 'hypervisor' => 'QEMU', 'hypervisor_major' => 9, 'hypervisor_minor' => 2, 'hypervisor_release' => 0, 'hypervisor_string' => 'QEMU 9.2.0', 'hypervisor_maxvcpus' => 255, 'encrypted' => 'No', 'secure' => 'Yes', 'num_inactive_domains' => 0, 'num_active_domains' => 0]; }
function libvirt_connect_get_capabilities($conn, $xpath = null) { return "<capabilities><host><cpu><arch>x86_64</arch></cpu></host><guest><os_type>hvm</os_type><arch name='x86_64'><machine>pc-q35-9.2</machine></arch></guest></capabilities>"; }
function libvirt_connect_get_domain_capabilities(...$args) { return "<domainCapabilities><os supported='yes'/></domainCapabilities>"; }
function libvirt_connect_get_machine_types(...$args) { return []; }
function libvirt_connect_get_all_domain_stats(...$args) { return []; }
function libvirt_node_get_info($conn) { return ['model' => 'x86_64', 'memory' => 16 * 1024 * 1024, 'cpus' => 8, 'nodes' => 1, 'sockets' => 1, 'cores' => 4, 'threads' => 2, 'mhz' => 2800]; }
function libvirt_list_domains($conn) { return array_map(fn($vm) => $vm['name'], libvirt_stub_vms()); }
function libvirt_list_active_domain_ids($conn) { $ids = []; foreach (libvirt_stub_vms() as $i => $vm) if (!empty($vm['running'])) $ids[] = $i + 1; return $ids; }
function libvirt_list_domain_snapshots($dom) { return []; }
function libvirt_list_nodedevs($conn, $cap = null) { return []; }
function libvirt_list_networks($conn, $flags = 0) { return ['default']; }
function libvirt_get_net_list(...$args) { return []; }
function libvirt_get_net_res(...$args) { return false; }
function libvirt_get_net_xml(...$args) { return false; }
function libvirt_network_get(...$args) { return false; }
function libvirt_network_get_xml_desc(...$args) { return false; }
function libvirt_nodedev_get(...$args) { return false; }
function libvirt_nodedev_capabilities(...$args) { return []; }
function libvirt_nodedev_get_xml_desc(...$args) { return false; }
function libvirt_nodedev_get_information(...$args) { return false; }
function libvirt_domain_lookup_by_name($conn, $name) { if (is_resource($name)) return $name; $vm = libvirt_stub_vm($name); return $vm ? libvirt_stub_handle($vm['name']) : false; }
function libvirt_domain_lookup_by_uuid_string($conn, $uuid) { $vm = libvirt_stub_vm($uuid); return $vm ? libvirt_stub_handle($vm['name']) : false; }
function libvirt_domain_get_name($dom) { return libvirt_stub_vm($dom)['name'] ?? false; }
function libvirt_domain_get_uuid_string($dom) { return libvirt_stub_vm($dom)['uuid'] ?? false; }
function libvirt_domain_get_id($dom) { $vm = libvirt_stub_vm($dom); return $vm && !empty($vm['running']) ? $vm['index'] + 1 : -1; }
function libvirt_domain_is_active($dom) { return !empty(libvirt_stub_vm($dom)['running']); }
function libvirt_domain_get_autostart($dom) { return !empty(libvirt_stub_vm($dom)['autostart']) ? 1 : 0; }
function libvirt_domain_set_autostart($dom, $on) { return libvirt_stub_set($dom, ['autostart' => (bool)$on]); }
function libvirt_domain_get_info($dom) {
    $vm = libvirt_stub_vm($dom);
    if (!$vm) return false;
    $state = empty($vm['running']) ? 5 : (!empty($vm['paused']) ? 3 : 1);
    $mem = (int)($vm['memoryKiB'] ?? 4194304);
    return ['maxMem' => $mem, 'memory' => $mem, 'state' => $state, 'nrVirtCpu' => (int)($vm['vcpus'] ?? 2), 'cpuUsed' => $state === 1 ? 1234.5 : 0];
}
function libvirt_domain_get_xml_desc($dom, $xpath = null, $flags = 0) { $vm = libvirt_stub_vm($dom); return $vm ? libvirt_stub_xml($vm) : false; }
function libvirt_domain_xml_xpath($dom, $xpath, $flags = 0) {
    $vm = libvirt_stub_vm($dom);
    if (!$vm) return false;
    $doc = new DOMDocument();
    $doc->loadXML(libvirt_stub_xml($vm));
    $nodes = @(new DOMXPath($doc))->query($xpath);
    $result = ['num' => 0, 'xpath' => $xpath];
    if ($nodes) foreach ($nodes as $node) { $result[$result['num']] = $node->nodeValue; $result['num']++; }
    return $result;
}
function libvirt_domain_get_block_info($dom, $dev) { return ['device' => $dev, 'file' => '', 'type' => 'raw', 'capacity' => 32 * 1024 ** 3, 'allocation' => 12 * 1024 ** 3, 'physical' => 12 * 1024 ** 3]; }
function libvirt_domain_interface_addresses($dom, $source = 0) {
    $vm = libvirt_stub_vm($dom);
    if (!$vm || empty($vm['running'])) return false;
    return [['name' => 'eth0', 'hwaddr' => sprintf('52:54:00:00:00:%02x', $vm['index'] % 256), 'naddrs' => 1, 'addrs' => [['addr' => '192.168.1.' . (100 + $vm['index']), 'prefix' => 24, 'type' => 0]]]];
}
function libvirt_domain_interface_stats(...$args) { return ['rx_bytes' => 0, 'tx_bytes' => 0]; }
function libvirt_domain_get_interface_devices($dom) { return ['num' => 1, 0 => 'vnet0']; }
function libvirt_domain_memory_stats(...$args) { return []; }
function libvirt_domain_get_counts($conn) { $vms = libvirt_stub_vms(); $active = count(array_filter($vms, fn($vm) => !empty($vm['running']))); return ['total' => count($vms), 'active' => $active, 'inactive' => count($vms) - $active]; }
function libvirt_domain_get_screen_dimensions(...$args) { return false; }
function libvirt_domain_qemu_agent_command(...$args) { return false; }
function libvirt_domain_create($dom) { return libvirt_stub_set($dom, ['running' => true, 'paused' => false]); }
function libvirt_domain_shutdown($dom) { return libvirt_stub_set($dom, ['running' => false, 'paused' => false]); }
function libvirt_domain_destroy($dom) { return libvirt_stub_set($dom, ['running' => false, 'paused' => false]); }
function libvirt_domain_reboot($dom, $flags = 0) { return true; }
function libvirt_domain_suspend($dom) { return libvirt_stub_set($dom, ['paused' => true]); }
function libvirt_domain_resume($dom) { return libvirt_stub_set($dom, ['paused' => false]); }
function libvirt_domain_managedsave($dom) { return libvirt_stub_set($dom, ['running' => false]); }
foreach (['libvirt_domain_define_xml', 'libvirt_domain_create_xml', 'libvirt_domain_undefine', 'libvirt_domain_update_device', 'libvirt_domain_change_boot_devices',
    'libvirt_domain_send_keys', 'libvirt_domain_send_pointer_event', 'libvirt_domain_disk_remove', 'libvirt_domain_snapshot_create', 'libvirt_domain_snapshot_delete',
    'libvirt_domain_snapshot_get_xml', 'libvirt_domain_snapshot_lookup_by_name', 'libvirt_domain_snapshot_revert', 'libvirt_storagevolume_create_xml'] as $libvirtStubName) {
    if (!function_exists($libvirtStubName)) eval("function $libvirtStubName(...\$args) { return false; }");
}
