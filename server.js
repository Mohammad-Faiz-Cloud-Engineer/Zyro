/* ═══════════════════════════════════════════════════════════════════
   Zyro Local Dev Server — Static files + CORS Proxy
   Run: node server.js
   Open: http://localhost:8080
   ═══════════════════════════════════════════════════════════════════ */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const API_TARGET = 'costum-boomber-api.vercel.app';

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
    // ── CORS Proxy: Forward /api/* requests to Vercel ──
    if (req.url.startsWith('/api')) {
        const options = {
            hostname: API_TARGET,
            path: req.url,
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Zyro-DevProxy/1.0',
            },
        };

        const proxyReq = https.request(options, (proxyRes) => {
            let body = '';
            proxyRes.on('data', chunk => body += chunk);
            proxyRes.on('end', () => {
                res.writeHead(proxyRes.statusCode, {
                    'Content-Type': proxyRes.headers['content-type'] || 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                });
                res.end(body);
            });
        });

        proxyReq.on('error', (err) => {
            res.writeHead(502, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            });
            res.end(JSON.stringify({ ok: false, error: err.message }));
        });

        proxyReq.end();
        return;
    }

    // ── Static File Server ──
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, filePath.split('?')[0]); // strip query strings
    filePath = path.resolve(filePath); // resolve any ../ segments to an absolute path

    // Block path traversal — resolved path must stay inside the project root
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`\n  Zyro Dev Server running at http://localhost:${PORT}\n`);
    console.log(`  API proxy:  /api/* -> https://${API_TARGET}/api/*`);
    console.log(`  Static:     ./ -> http://localhost:${PORT}/\n`);
});
