const SHELL_CACHE = 'orbit-shell-v6';
const RUNTIME_CACHE = 'orbit-runtime-v6';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) =>
            cache.addAll([
                '/',
                '/favicon.ico',
                '/manifest.webmanifest',
            ])
        )
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => ![SHELL_CACHE, RUNTIME_CACHE].includes(key))
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
    if (!isHttp) return;
    // Never cache during localhost development. Prevents stale bundle/image behavior.
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;

    // Never intercept Next.js internals or app-router flight data.
    if (
        url.pathname.startsWith('/_next/') ||
        /__next|_rsc|__PAGE|_buildManifest|_ssgManifest/i.test(url.pathname) ||
        req.destination === 'document'
    ) {
        return;
    }

    // Static + images: stale-while-revalidate
    if (
        req.destination === 'image' ||
        req.destination === 'script' ||
        req.destination === 'style' ||
        req.destination === 'font' ||
        url.pathname.startsWith('/_next/static/')
    ) {
        event.respondWith(
            caches.match(req).then((cached) => {
                // Cache-first for static/media to avoid duplicate fan-out requests.
                if (cached) return cached;
                return fetch(req)
                    .then((res) => {
                        if (res && res.ok) {
                            const copy = res.clone();
                            caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, copy)).catch(() => { });
                        }
                        return res;
                    })
                    .catch(() => cached);
            })
        );
    }
});

self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: data.icon || '/icon-192x192.png',
            badge: '/badge-72x72.png',
            vibrate: [100, 50, 100],
            data: {
                dateOfArrival: Date.now(),
                primaryKey: '2',
                url: data.url || '/'
            },
        };
        event.waitUntil(self.registration.showNotification(data.title, options));
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});
