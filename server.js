/* ═══════════════════════════════════════════════════════════════════
   Zyro Local Dev Server — Static files + CORS Proxy
   Run: node server.js
   Open: http://localhost:7860
   ═══════════════════════════════════════════════════════════════════ */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 7860;
const HOST = process.env.HOST || '0.0.0.0';
const API_TARGET = 'costum-boomber-api.vercel.app';
const ROOT = path.resolve(__dirname);
const PROXY_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS) || 180000;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

function sendJson(res, status, payload, extraHeaders) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        ...extraHeaders,
    });
    res.end(JSON.stringify(payload));
}

function isInsideRoot(resolvedPath) {
    const rel = path.relative(ROOT, resolvedPath);
    return rel === '' || (rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function corsPreflight(res) {
    res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    });
    res.end();
}

const server = http.createServer((req, res) => {
    const requestUrl = req.url || '/';

    if (req.method === 'OPTIONS') {
        corsPreflight(res);
        return;
    }

    // ── CORS Proxy: Forward /api* requests to Vercel ──
    if (requestUrl.startsWith('/api')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            sendJson(res, 405, { ok: false, error: 'Method not allowed' }, { Allow: 'GET, HEAD, OPTIONS' });
            return;
        }

        const options = {
            hostname: API_TARGET,
            path: requestUrl,
            method: req.method,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Zyro-DevProxy/1.0',
            },
        };

        const proxyReq = https.request(options, (proxyRes) => {
            const chunks = [];
            proxyRes.on('data', (chunk) => chunks.push(chunk));
            proxyRes.on('end', () => {
                const body = Buffer.concat(chunks);
                const headers = {
                    'Content-Type': proxyRes.headers['content-type'] || 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Cache-Control': 'no-store',
                };
                res.writeHead(proxyRes.statusCode || 502, headers);
                if (req.method === 'HEAD') {
                    res.end();
                    return;
                }
                res.end(body);
            });
        });

        proxyReq.setTimeout(PROXY_TIMEOUT_MS, () => {
            proxyReq.destroy(new Error('Upstream timeout'));
        });

        proxyReq.on('error', (err) => {
            if (res.headersSent) return;
            sendJson(res, 502, { ok: false, error: err.message || 'Bad gateway' });
        });

        proxyReq.end();
        return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD, OPTIONS' });
        res.end('405 Method Not Allowed');
        return;
    }

    // ── Static File Server ──
    let urlPath;
    try {
        urlPath = decodeURIComponent(requestUrl.split('?')[0]);
    } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('400 Bad Request');
        return;
    }

    if (urlPath === '/') urlPath = '/index.html';

    const filePath = path.resolve(ROOT, '.' + urlPath.replace(/\\/g, '/'));

    if (!isInsideRoot(filePath)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Forbidden');
        return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // codeql[js/path-injection] filePath validated by isInsideRoot() above
    fs.stat(filePath, (statErr, stats) => {
        if (statErr || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
            return;
        }

        if (req.method === 'HEAD') {
            res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': stats.size });
            res.end();
            return;
        }

        // codeql[js/path-injection] filePath validated by isInsideRoot() above
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('404 Not Found');
                return;
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        });
    });
});

server.on('error', (err) => {
    console.error(`Failed to start server on ${HOST}:${PORT}:`, err.message);
    process.exit(1);
});

server.listen(PORT, HOST, () => {
    console.log(`\n  Zyro Dev Server running at http://localhost:${PORT}\n`);
});
