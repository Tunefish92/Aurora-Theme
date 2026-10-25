// Front of the fake Unraid server ($PORT, default 8080), in the place of Unraid's nginx: passes
// requests on to PHP's built-in server ($PHP_PORT) and answers Unraid's live channels
// (/sub/<channel>, nchan websockets) itself. dockerload gets what Unraid's docker_load script
// publishes every second ("id;cpu%;used / limit" per running container), from
// /tmp/sim/containers.json.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';

const PORT = Number(process.env.PORT || 8080);
const PHP = { host: '127.0.0.1', port: Number(process.env.PHP_PORT || 8081) };
const STATE = '/tmp/sim/containers.json';
const load = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return { containers: [] }; } };

const server = http.createServer((req, res) => {
    const upstream = http.request({ ...PHP, method: req.method, path: req.url, headers: req.headers }, reply => {
        res.writeHead(reply.statusCode, reply.headers);
        reply.pipe(res);
    });
    upstream.on('error', error => { res.writeHead(502); res.end(String(error)); });
    req.pipe(upstream);
});

// A websocket text frame (server to client, unmasked).
const frame = text => {
    const data = Buffer.from(text);
    const head = data.length < 126 ? Buffer.from([0x81, data.length])
        : data.length < 65536 ? Buffer.from([0x81, 126, data.length >> 8, data.length & 255])
        : Buffer.concat([Buffer.from([0x81, 127, 0, 0, 0, 0]), Buffer.from([(data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255])]);
    return Buffer.concat([head, data]);
};

const publishers = {
    dockerload: () => {
        const state = load();
        if (state.dockerloadOff) return null;
        return state.containers.filter(ct => ct.running && !ct.paused)
            .map(ct => `${ct.id.slice(0, 12)};${(Math.random() * 12).toFixed(2)}%;${(Math.random() * 900 + 20).toFixed(1)}MiB / 15.52GiB`).join('\n') + '\n';
    },
};

let messageId = 0;
server.on('upgrade', (req, socket) => {
    const channel = (req.url.match(/^\/sub\/([^?]+)/) || [])[1];
    if (!channel) return socket.destroy();
    const key = req.headers['sec-websocket-key'];
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    const protocol = (req.headers['sec-websocket-protocol'] || '').includes('ws+meta.nchan');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
        + `Sec-WebSocket-Accept: ${accept}\r\n` + (protocol ? 'Sec-WebSocket-Protocol: ws+meta.nchan\r\n' : '') + '\r\n');
    const send = text => socket.write(frame(protocol ? `id: ${Date.now()}:${messageId++}\ncontent-type: text/plain\n\n${text}` : text));
    const publish = publishers[channel.split(',')[0]];
    const timer = publish && setInterval(() => { const text = publish(); if (text !== null) send(text); }, 1000);
    socket.on('data', chunk => { if ((chunk[0] & 0x0f) === 8) socket.end(); });
    socket.on('close', () => clearInterval(timer));
    socket.on('error', () => clearInterval(timer));
});
server.listen(PORT, '127.0.0.1', () => console.log('fake Unraid on http://127.0.0.1:' + PORT));
