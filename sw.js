const CACHE='liveset-shell-v59';
const SHELL=[
  './',
  './index.html',
  './manifest.webmanifest',
  './logo.svg',
  './icons/app-icon.svg',
  './src/app.css',
  './src/performance.css',
  './src/app-v2.js',
  './src/audio.js',
  './src/models.js',
  './src/setlist.js',
  './src/storage.js',
  './src/song-service.js',
  './src/id3.js',
  './src/cifra.js',
  './src/cifra-scroll.js',
  './src/chords.js',
  './src/transpose.js',
  './src/icons.js',
  './src/i18n.js',
  './src/cifraclub-import.js',
  './src/analytics.js',
  './src/settings-service.js',
  './src/backup-service.js',
  './src/pitch-worklet.js'
];

// Do NOT skipWaiting here — new SWs stay in "waiting" until the user opts in via
// the update pill in the app. That lets us guarantee no silent mid-gig reloads.
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(SHELL))
));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())
));
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
