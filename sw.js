const CACHE='liveset-shell-v35';
const SHELL=['./','./index.html','./manifest.webmanifest','./src/app-v2.js','./src/track-service.js','./src/storage.js','./src/models.js','./src/setlist.js','./src/audio.js','./src/stem-pcm.js','./src/stem-stream.js','./src/stem-preparation-worker.js','./src/stem-player-worklet.js','./src/stem-model-manifest.js','./src/model-asset-service.js','./src/stem-separation-service.js','./src/stem-separation-worker.js','./src/m4a-media.js','./src/liveset-package.js','./src/liveset-package-worker.js','./src/vendor/mediabunny.min.mjs','./src/vendor/fflate.js','./qualification/vendor/ort.webgpu.min.mjs','./qualification/vendor/ort-wasm-simd-threaded.asyncify.mjs','./qualification/vendor/ort-wasm-simd-threaded.asyncify.wasm','./qualification/vendor/ort-wasm-simd-threaded.jsep.mjs','./qualification/vendor/ort-wasm-simd-threaded.jsep.wasm','./src/app.css','./src/refinement.css','./src/brand.css','./src/editor.css','./logo.png','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png'];

SHELL.push('./src/cifra.js','./src/chords.js','./src/cifra-scroll.js','./src/performance-v1.css','./src/scrollbar.css');
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  const updateSensitive=request.mode==='navigate'||request.destination==='script'||request.destination==='style';
  if(url.origin===location.origin&&updateSensitive){
    event.respondWith(fetch(request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(request,copy));
      return response;
    }).catch(()=>caches.match(request).then(cached=>cached||caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
});
