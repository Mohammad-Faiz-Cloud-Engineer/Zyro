self.addEventListener('install', (event) => {
    self.skipWaiting();
    // EXPLICIT DECISION: We do NOT pre-cache HTML/CSS/JS here.
    // This strictly respects the zero-caching requirement of the platform
    // ensuring clients always receive the latest updates directly from the server.
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).then(() => clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // PWA installability needs a fetch listener. Intercept document navigations
    // only. fetch() to /api uses Accept: */*, so the old text/html Accept match
    // did not wrap API calls; it could still wrap other HTML GETs and apply the
    // default HTTP cache, which fights this app's no-store HTML policy.
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request, { cache: 'no-store' }).catch(() => {
                return new Response(
                    `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Offline - Zyro</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f8fafc; color: #0f172a; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; padding: 20px; }
        h1 { color: #4f46e5; margin-bottom: 10px; }
        p { color: #475569; max-width: 400px; line-height: 1.5; }
        .icon { width: 64px; height: 64px; margin-bottom: 20px; color: #4f46e5; }
    </style>
</head>
<body>
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        <line x1="2" y1="2" x2="22" y2="22" stroke="#dc2626" stroke-width="2" />
    </svg>
    <h1>You are offline</h1>
    <p>Zyro requires an active internet connection to communicate with the dispatch API. Please check your network and try again.</p>
</body>
</html>`,
                    { headers: { 'Content-Type': 'text/html' } }
                );
            })
        );
    } else {
        // OPTIMIZATION: For all non-HTML requests (API, CSS, JS), do NOT call event.respondWith().
        // By simply returning, we let the browser handle the request natively.
        // This avoids the overhead of proxying every single network request through the Service Worker,
        // reducing latency on the /api calls and static assets.
        return;
    }
});
