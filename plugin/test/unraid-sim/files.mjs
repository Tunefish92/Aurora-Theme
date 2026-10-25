// The files on the fake Unraid server that hold orders and autostart: Unraid's container and VM
// order, Docker's autostart list, the plugins' order, folder and start-order files, Aurora's groups.
import fs from 'node:fs';
import path from 'node:path';
const read = file => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };
export function orderFiles() {
    const files = {
        'unraid order': '/boot/config/plugins/dockerMan/userprefs.cfg',
        'autostart': '/var/lib/docker/unraid-autostart',
        'vm order': '/boot/config/plugins/dynamix.vm.manager/userprefs.cfg',
        'aurora docker groups': '/boot/config/plugins/Aurora-Theme/docker-groups.json',
    };
    for (const dir of ['/boot/config/plugins/folder.view3', '/boot/config/plugins/folderview.plus']) {
        let names = [];
        try { names = fs.readdirSync(dir); } catch { continue; }
        for (const name of names) if (/\.(json|cfg)$/.test(name) && !/backup|log|lock|token|metadata/i.test(name)) files[path.basename(dir) + '/' + name] = path.join(dir, name);
    }
    return Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
}
if (process.argv[1].endsWith('files.mjs')) console.log(JSON.stringify(orderFiles(), null, 1));
