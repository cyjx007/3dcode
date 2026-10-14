const CACHE_NAME = '3dcube-cache-v4';
const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './cube.png',
    './assets/styles/cube.css',
    './assets/styles/doodle2.css',
    './assets/styles/certificate2.css',
    './assets/styles/game.css',
    './assets/scripts/tween.r12.js',
    './assets/scripts/three.js',
    './assets/scripts/cuber.min.js',
    './assets/scripts/iecss3d.js',
    './assets/scripts/ierenderer.js',
    './assets/scripts/deviceMotion.js',
    './assets/scripts/locked.js',
    './assets/scripts/textBox.js',
    './assets/scripts/ResizeableTextBox.3.js',
    './assets/scripts/divBox.js',
    './assets/scripts/frames.js',
    './assets/scripts/certificate.js',
    './assets/scripts/main3.js',
    './assets/scripts/cube-solver.js',
    './assets/scripts/game.js'
];

// Install: pre-cache core assets
self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function (cache) {
                // Use addAll with individual fallback — if one asset fails,
                // don't block installation entirely
                return Promise.allSettled(
                    CORE_ASSETS.map(function (url) {
                        return cache.add(url);
                    })
                );
            })
            .then(function () {
                self.skipWaiting();
            })
    );
});

// Activate: clean up old caches
self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys()
            .then(function (keys) {
                return Promise.all(
                    keys
                        .filter(function (key) { return key !== CACHE_NAME; })
                        .map(function (key) { return caches.delete(key); })
                );
            })
            .then(function () {
                self.clients.claim();
            })
    );
});

// Fetch: stale-while-revalidate for same-origin assets,
// network-first for cross-origin requests (pet data, avatars)
self.addEventListener('fetch', function (event) {
    var request = event.request;

    // Only handle GET requests
    if (request.method !== 'GET') {
        return;
    }

    var url = new URL(request.url);
    var sameOrigin = url.origin === self.location.origin;

    if (sameOrigin) {
        // Stale-while-revalidate for same-origin assets
        event.respondWith(
            caches.match(request)
                .then(function (cached) {
                    var fetchPromise = fetch(request)
                        .then(function (response) {
                            // Cache successful responses
                            if (response && response.status === 200) {
                                var responseClone = response.clone();
                                caches.open(CACHE_NAME)
                                    .then(function (cache) {
                                        cache.put(request, responseClone);
                                    });
                            }
                            return response;
                        })
                        .catch(function () {
                            // Network failed — return cached version if available
                            return cached;
                        });

                    // Return cached immediately if available, otherwise wait for network
                    return cached || fetchPromise;
                })
        );
    } else {
        // Cross-origin: try network first, fall back to cache
        event.respondWith(
            fetch(request)
                .then(function (response) {
                    // Cache cross-origin image responses
                    if (response && response.status === 200 && request.destination === 'image') {
                        var responseClone = response.clone();
                        caches.open(CACHE_NAME)
                            .then(function (cache) {
                                cache.put(request, responseClone);
                            });
                    }
                    return response;
                })
                .catch(function () {
                    return caches.match(request);
                })
        );
    }
});
