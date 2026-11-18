const CACHE_NAME = "coder-offline-v32";
const CORE_ASSETS = [
    "./",
    "./index.html",
    "./css/theme.css",
    "./js/android_sdk_knowledge.js",
    "./js/session_persistence.js",
    "./js/neuro_symbolic_engine.js",
    "./js/ide_core.js",
    "./js/vision_runtime_analyzer.js",
    "./js/port_fixes.js",
    "./js/cross_file_truncation.js",
    "./js/rom_analyzer.js",
    "./js/port_blueprint_learner.js",
    "./js/local_bridge.js"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;
    event.respondWith(
        fetch(event.request)
            .then((resp) => {
                if (!resp.ok) return resp;
                const clone = resp.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
                return resp;
            })
            .catch(() => caches.match(event.request))
    );
});
