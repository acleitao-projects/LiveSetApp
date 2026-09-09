# LiveSet 1 — Architecture

## Shape

Single-page vanilla-JS PWA. No framework, no build step. `index.html` loads two stylesheets and `src/app-v2.js` as an ES module. The service worker (`sw.js`) caches the shell for offline use.

## Modules

| File | Responsibility |
|---|---|
| `src/app-v2.js` | Application shell, all view rendering, all event handling, boot. |
| `src/audio.js` | Long-lived `AudioEngine` wrapping one `<audio>` element. Never re-created. |
| `src/song-service.js` | Song picking (File System Access API on Chromium, `<input type=file>` + OPFS copy on Safari), dedupe by filename+size, `songUrl()`, `saveCifra` / `saveMetadata` / `saveTranspose` / `saveScrollSettings`. |
| `src/storage.js` | IndexedDB wrapper (`songs`, `setlists`, `appSettings`), OPFS wrapper, capability detection, storage estimate. |
| `src/models.js` | `Song` schema, `Setlist` schema, `trackItem(songId)`, `breakItem(...)`, stable UUIDs. |
| `src/setlist.js` | Stable-ID mutations (`insertAfter`, `moveItem`, `removeItem`), duration formatting, `resolveNext` / `resolvePrevious` (survive item removal via `lastKnownOrder`). |
| `src/cifra.js` | Non-destructive parser; classifies lines (`section` / `chords` / `lyrics` / `blank`), pairs chord-over-lyric rows, extracts unique chords in source order. |
| `src/chords.js` | Bundled guitar chord vocabulary + inline SVG diagram renderer. |
| `src/transpose.js` | Pure `transposeChordToken` / `transposeChordLine`, sharps by default. |
| `src/cifra-scroll.js` | Pure sub-pixel accumulation for auto-scroll timing. |
| `src/icons.js` | Inline SVG icon set. |

## Storage

- **IndexedDB (`liveset-db` v2)**: `songs`, `setlists`, `appSettings`. Each keyed by `id`.
- **OPFS (`liveset/`)**: `songs/{songId}/original.{ext}` — only used on iOS Safari, where the File System Access API is not available and the audio must be copied on first pick.

The `Song.source` field is a tagged union:

```
{kind: 'handle', handle}    // Chromium: FileSystemFileHandle stored in IndexedDB
{kind: 'opfs',  path}       // Safari: OPFS path
```

`songUrl(song)` branches on kind, re-requests handle permission if needed, and returns a fresh object URL.

## Audio engine

One `AudioEngine` instance is created at module load and lives for the whole session. It owns a single `HTMLAudioElement`. `render()` writes only to `document.querySelector('#app').innerHTML` and never removes the audio element (it lives outside the DOM tree). This is the mechanical guarantee for the playback invariant.

`AudioEngine.snapshot()` exposes `engineId`, `graphVersion`, `sessionId`, `songId`, `sourceIdentity`, `currentTime`, `paused`. These are the diagnostics used to prove that setlist mutations do not interrupt playback.

## Playback invariant

For every mutation path — add song, remove song, reorder, add/remove/edit break, open/save edit sheet, transpose ±, change speed, open/close drawer, toggle fullscreen — the following must hold:

- `engineId` unchanged.
- `sessionId` unchanged.
- `songId` unchanged.
- `sourceIdentity` unchanged.
- `currentTime` monotonically advances.

## Data contracts

### Song (schemaVersion 2)

```
{
  id, schemaVersion, title, artist,
  originalFilename, originalSize, durationSeconds,
  source: {kind:'handle', handle} | {kind:'opfs', path},
  cifraSource,
  transposeSemitones,
  cifraScrollSpeed, cifraAutoScrollEnabled,
  createdAt, updatedAt
}
```

### Setlist

```
{
  id, schemaVersion, name,
  items: [
    {id, type:'track', songId} |
    {id, type:'break', label, durationMinutes}
  ],
  createdAt, updatedAt
}
```

## Offline behavior

The service worker precaches the shell (HTML, CSS, JS modules, icons, logo). Update-sensitive requests (navigation, scripts, styles) use a network-first strategy with cached fallback, so updates propagate without breaking the running app. Media (audio) resolves from OPFS or via the persisted FileSystemFileHandle; neither hits the network.

## Compatibility notes

- **iPad / iPhone Safari** — no File System Access API. Audio is copied to OPFS on first pick. This is the only reason we still have a copy step.
- **Android Chrome, desktop Chromium** — File System Access API available. The handle is stored inside the Song record in IndexedDB and re-permissioned on first read after page load.
- **Firefox / older Safari** — falls back to OPFS-copy path.
