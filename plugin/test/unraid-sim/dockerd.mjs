// Fake Docker Engine API on /var/run/docker.sock for the fake Unraid server: answers what
// Unraid's DockerClient.php asks (containers, inspect, images, info, start/stop/...), from
// /tmp/sim/containers.json, which scenario.mjs writes. Also answers the fake docker CLI
// (docker-cli.sh) on /_cli.
import fs from 'node:fs';
import http from 'node:http';

const SOCKET = '/var/run/docker.sock';
const STATE = '/tmp/sim/containers.json';
const load = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return { containers: [] }; } };
const save = state => fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
const created = Math.floor(Date.now() / 1000) - 86400 * 30;

const fullId = ct => ct.id.padEnd(64, '0');
const image = ct => ct.image.includes(':') ? ct.image : ct.image + ':latest';
const networkMode = ct => ct.network || 'bridge';
const ip = (ct, index) => ct.network === 'host' ? '' : `${ct.network === 'br0' ? '192.168.1' : '172.17.0'}.${(index % 250) + 3}`;
const networks = (ct, index) => ({ [networkMode(ct)]: { IPAddress: ct.running ? ip(ct, index) : '', MacAddress: ct.running ? '02:42:ac:11:00:' + (index % 99).toString().padStart(2, '0') : '' } });
const status = ct => ct.running ? (ct.paused ? 'Up 3 hours (Paused)' : 'Up 3 hours') : 'Exited (0) 2 hours ago';
const ports = ct => Object.fromEntries((ct.ports || []).map(([inside, type, outside]) => [`${inside}/${type}`, outside ? [{ HostIp: '', HostPort: String(outside) }] : null]));
const summary = (ct, index) => ({
    Id: fullId(ct), Names: ['/' + ct.name], Image: image(ct), ImageID: 'sha256:' + ct.imageId.padEnd(64, '0'), Command: '/init', Created: created,
    State: ct.running ? (ct.paused ? 'paused' : 'running') : 'exited', Status: status(ct), Ports: [], Labels: ct.labels || {},
    HostConfig: { NetworkMode: networkMode(ct) }, NetworkSettings: { Networks: networks(ct, index) }, Mounts: [],
});
const inspect = (ct, index) => ({
    Id: fullId(ct), Name: '/' + ct.name, Created: new Date(created * 1000).toISOString(), Image: 'sha256:' + ct.imageId.padEnd(64, '0'),
    State: { Status: ct.running ? 'running' : 'exited', Running: !!ct.running, Paused: !!ct.paused, Restarting: false, Pid: ct.running ? 1000 + index : 0, StartedAt: new Date(Date.now() - 3 * 3600e3).toISOString() },
    Config: { Image: image(ct), Labels: { 'net.unraid.docker.managed': ct.manager || 'dockerman', ...(ct.webui ? { 'net.unraid.docker.webui': ct.webui } : {}), ...(ct.labels || {}) },
        ExposedPorts: Object.fromEntries((ct.ports || []).map(([inside, type]) => [`${inside}/${type}`, {}])), Env: [] },
    HostConfig: { Binds: ct.volumes || [], PortBindings: ports(ct), NetworkMode: networkMode(ct), CpusetCpus: '' },
    NetworkSettings: { Networks: networks(ct, index) }, LogPath: '',
});
const images = state => {
    const byId = new Map();
    state.containers.forEach(ct => byId.set(ct.imageId, { Id: 'sha256:' + ct.imageId.padEnd(64, '0'), ParentId: '', RepoTags: [image(ct)], Created: created, Size: 123456789, VirtualSize: 123456789 }));
    (state.orphanImages || []).forEach(tag => byId.set(tag, { Id: 'sha256:' + Buffer.from(tag).toString('hex').slice(0, 12).padEnd(64, '0'), ParentId: '', RepoTags: [tag], Created: created, Size: 1, VirtualSize: 1 }));
    return [...byId.values()];
};

function cli(args, state) {
    const text = args.join(' ');
    const find = name => state.containers.find(ct => ct.name === name || fullId(ct).startsWith(name));
    if (/^network ls --format='\{\{\.Name\}\}=\{\{\.Driver\}\}'/.test(text)) return 'bridge=bridge\nhost=host\nnone=null\nbr0=macvlan';
    if (/^network ls/.test(text)) return 'br0';
    if (/^network inspect/.test(text)) return args.at(-1) === 'br0' ? '192.168.1.0/24' : '172.17.0.0/16';
    if (args[0] === 'ps') {
        const filter = text.match(/status='?(\w+)/);
        const list = state.containers.filter(ct => !filter || (filter[1] === 'running' ? ct.running && !ct.paused : filter[1] === 'paused' ? ct.paused : !ct.running));
        return list.map(ct => text.includes('Size') ? `${ct.name}|0B (virtual 123MB)` : ct.name).join('\n');
    }
    if (args[0] === 'inspect') {
        const ct = find(args.at(-1));
        if (!ct) return '';
        const index = state.containers.indexOf(ct);
        if (text.includes('{{.Name}}')) return '/' + ct.name;
        if (text.includes('State.Pid')) return `${ct.running ? 1000 + index : 0} map[${networkMode(ct)}:0xc000]`;
        if (text.includes('IPAddress')) return ip(ct, index) + ' ';
        return '';
    }
    if (['start', 'stop', 'restart', 'pause', 'unpause', 'kill'].includes(args[0])) { act(args[0], find(args[1]), state); return args[1]; }
    return '';
}

function act(action, ct, state) {
    if (!ct) return false;
    if (action === 'start' || action === 'restart') { ct.running = true; ct.paused = false; }
    if (action === 'stop' || action === 'kill') { ct.running = false; ct.paused = false; }
    if (action === 'pause') ct.paused = true;
    if (action === 'unpause') ct.paused = false;
    save(state);
    return true;
}

try { fs.unlinkSync(SOCKET); } catch { /* not there */ }
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://docker');
    const state = load();
    const json = (body, code = 200) => {
        const text = JSON.stringify(body);
        res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
        res.end(text);
    };
    const path = url.pathname.replace(/^\/v[\d.]+/, '');
    let match;
    if (path === '/_cli') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => { const out = cli(body.split('\n').filter(Boolean), state); res.writeHead(200, { 'Content-Length': Buffer.byteLength(out) }); res.end(out); });
        return;
    }
    if (path === '/containers/json') return json(state.containers.filter(ct => url.searchParams.get('all') === '1' || ct.running).map(summary));
    if ((match = path.match(/^\/containers\/([^/]+)\/json$/))) {
        const index = state.containers.findIndex(ct => ct.name === match[1] || fullId(ct).startsWith(match[1]));
        return index < 0 ? json({ message: 'No such container' }, 404) : json(inspect(state.containers[index], index));
    }
    if ((match = path.match(/^\/containers\/([^/]+)\/(start|stop|restart|pause|unpause|kill)$/))) {
        const ct = state.containers.find(item => item.name === match[1] || fullId(item).startsWith(match[1]));
        if (!ct) return json({ message: 'No such container' }, 404);
        const delay = state.actionDelay || 0;
        return setTimeout(() => { act(match[2], ct, state); res.writeHead(204); res.end(); }, delay);
    }
    if (path === '/images/json') return json(images(state));
    if (path === '/info') return json({ Containers: state.containers.length, ServerVersion: '27.5.1', Driver: 'btrfs' });
    if (path === '/version') return json({ Version: '27.5.1', ApiVersion: '1.47' });
    if (/\/logs$/.test(path)) { res.writeHead(200); return res.end(''); }
    json({ message: 'not modelled: ' + path }, 404);
});
server.listen(SOCKET, () => { fs.chmodSync(SOCKET, 0o666); console.log('fake dockerd on ' + SOCKET); });
