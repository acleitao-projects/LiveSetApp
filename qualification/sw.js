const CACHE='liveset-webgpu-qualification-v1';
const SHELL=['./','./index.html','./qualification.css','./qualification.js','./manifest.webmanifest','../logo.png','../icons/icon-192.png','../icons/icon-512.png','./vendor/ort.webgpu.min.mjs','./vendor/ort-wasm-simd-threaded.asyncify.mjs','./vendor/ort-wasm-simd-threaded.asyncify.wasm','./vendor/ort-wasm-simd-threaded.jsep.mjs','./vendor/ort-wasm-simd-threaded.jsep.wasm'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>event.respondWith(fetch(event.request).catch(()=>caches.match(event.request))));
