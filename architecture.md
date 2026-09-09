# LiveSet 1 — Architecture and Technical Specification

## 1. Architectural intent

LiveSet 1 V1 reuses the previously agreed PWA POC architecture:

- web-first Progressive Web App;
- plain HTML + CSS + JavaScript or a very lightweight build setup;
- browser-native APIs rather than a heavy framework;
- local-first/offline-first;
- Web Audio for performance playback/mixing;
- ONNX Runtime Web with WebGPU for local stem separation;
- IndexedDB for structured metadata/indexes;
- OPFS (Origin Private File System) for persistent local media/model/package assets;
- Service Worker + web app manifest for installability/offline shell;
- later Capacitor packaging for Android/iOS without rewriting the core application.

Do not replace this with React Native, Electron, a server-backed SPA, Python desktop UI or another architecture for V1.

## 2. Important prototype-to-runtime correction

The supplied prototypes are separate HTML files for design convenience:

- performance prototype;
- track editor/stem splitter prototype.

The production app must **not** treat them as independent pages whose navigation tears down the JavaScript runtime.

Implement one long-lived application shell with view switching.

Reason:

- a full page navigation can destroy the active media element/Web Audio context;
- the product requires continuous audio while the musician changes UI state;
- setlist drawer behavior, Track Editor state and local storage services benefit from shared long-lived services.

Suggested runtime structure:

```text
AppShell
├── Router/ViewController
│   ├── PerformanceView
│   └── TrackEditorView
├── AudioEngine              (singleton / long lived)
├── SetlistSessionService
├── TrackRepository
├── SetlistRepository
├── StorageService
├── ImportExportService
├── CifraService
├── ChordService
├── StemSeparationService
└── PwaService
```

This does not require a framework. A small module-based vanilla JS app is acceptable and preferred if maintainable.

## 3. Recommended project layout

Example only; names may vary but responsibilities must remain separated.

```text
/src
  /app
    app.js
    router.js
    state.js
  /audio
    audio-engine.js
    stem-player.js
    original-player.js
    transport.js
  /tracks
    track-repository.js
    track-service.js
    track-schema.js
  /setlists
    setlist-repository.js
    setlist-session.js
    setlist-schema.js
  /storage
    indexeddb.js
    opfs.js
    asset-store.js
  /import-export
    import-service.js
    export-service.js
    liveset-package.js
  /splitter
    splitter-service.js
    model-loader.js
    audio-preprocess.js
    audio-postprocess.js
    splitter.worker.js
  /cifra
    cifra-parser.js
    cifra-renderer.js
  /chords
    chord-parser.js
    chord-renderer.js
    chord-data.*
  /views
    performance-view.js
    track-editor-view.js
  /ui
    drawers.js
    dialogs.js
    notifications.js
  /pwa
    sw.js
    manifest.webmanifest
/public
  /assets
  /models
index.html
```

Keep application state/data logic out of DOM event handlers where possible.

## 4. Data storage strategy

### 4.1 Why two storage mechanisms

Use:

- IndexedDB for small structured records and indexes;
- OPFS for large binary assets.

Do not put multi-hundred-megabyte audio/stem blobs directly into a single JSON/localStorage structure.

Do not use `localStorage` for the media library.

### 4.2 OPFS reality

OPFS is intentionally application-private browser storage. It is not a normal user-visible folder accessible over USB.

Therefore V1 uses this model:

```text
User-visible device storage
        ↓ system file picker/import
LiveSet internal OPFS library
        ↓ export
.liveset package in user-visible save/share/download flow
```

This is required for consistent Android+iPad behavior.

### 4.3 IndexedDB stores

Suggested stores:

```text
tracks
setlists
appSettings
packageImports     (optional tracking/dedup metadata)
```

#### tracks record

```json
{
  "id": "uuid",
  "schemaVersion": 1,
  "title": "Wonderwall",
  "artist": "Oasis",
  "genre": "Rock",
  "originalFilename": "wonderwall.mp3",
  "originalAssetPath": "tracks/<id>/original.mp3",
  "originalMimeType": "audio/mpeg",
  "originalSize": 12345678,
  "durationSeconds": 258.4,
  "audioFingerprint": "optional-content-hash-or-stable-import-key",
  "stemState": "complete|none|invalid",
  "stems": {
    "vocals": "tracks/<id>/stems/vocals.<ext>",
    "guitar": "tracks/<id>/stems/guitar.<ext>",
    "bass": "tracks/<id>/stems/bass.<ext>",
    "drums": "tracks/<id>/stems/drums.<ext>",
    "other": "tracks/<id>/stems/other.<ext>"
  },
  "cifraSource": "...",
  "cifraParsedVersion": 1,
  "performance": {
    "cifraScrollSpeed": 1.0,
    "stemMute": {
      "vocals": true,
      "guitar": false,
      "bass": false,
      "drums": false,
      "other": false
    },
    "stemSolo": {
      "vocals": false,
      "guitar": false,
      "bass": false,
      "drums": false,
      "other": false
    },
    "playbackRate": 1.0,
    "transposeSemitones": 0
  },
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

`playbackRate`/`transposeSemitones` are included because the prototype exposes them. If pitch-safe transposition is technically postponed, track it explicitly in `progress.md`; do not fake DSP.

#### setlists record

```json
{
  "id": "uuid",
  "schemaVersion": 1,
  "name": "Friday Night",
  "items": [
    {
      "id": "uuid-instance",
      "type": "track",
      "trackId": "track-uuid"
    },
    {
      "id": "uuid-instance",
      "type": "break",
      "label": "Break",
      "durationMinutes": 15
    }
  ],
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

Setlist track items reference track IDs. Never copy track binary data per setlist.

### 4.4 OPFS layout

Suggested logical layout:

```text
/liveset/
  /tracks/
    /<track-id>/
      original.<source-ext>
      /stems/
        vocals.<chosen-output-ext>
        guitar.<chosen-output-ext>
        bass.<chosen-output-ext>
        drums.<chosen-output-ext>
        other.<chosen-output-ext>
      track.json               optional portable mirror/cache
  /models/
    five-stem-model.onnx       or model shard layout
  /temp/
    /imports/
    /splits/
    /exports/
```

The authoritative structured record may live in IndexedDB. A `track.json` sidecar in OPFS is recommended for package/export portability, but do not create two unsynchronized sources of truth. Generate/update it from the canonical track record.

## 5. Import architecture

### 5.1 Supported input

Use `<input type="file" accept="audio/*">` / supported system picker mechanisms.

Do not hard-code an inaccurate promise that every MP3/M4A/FLAC/AAC/WAV file will decode on every platform.

After selection, test actual decodability.

### 5.2 Import sequence

For a new external audio file:

1. Obtain `File` from system picker.
2. Validate non-zero size.
3. Attempt metadata/decode probe.
4. Calculate a dedup identity.
5. Check existing TrackRepository for probable duplicate.
6. If reuse is safe, reference existing track rather than copy media again.
7. Otherwise create a new track UUID.
8. Copy bytes into OPFS under track folder.
9. Write track record to IndexedDB only after the binary write succeeds.
10. Clean temporary files on failure.

### 5.3 Deduplication

Goal: avoid copying the same audio repeatedly when multiple setlists reference it.

At minimum:

- setlists always reference the same imported track ID;
- importing a track already chosen from the internal LiveSet library never duplicates bytes.

For external-file dedup, use a reliable identity strategy such as content hash when practical. Hashing large media may be expensive, so implementation may use a staged strategy:

1. compare size + filename + duration for candidate detection;
2. content-hash only candidates or hash progressively in a Worker;
3. ask the user only when ambiguity remains.

Do not sacrifice active playback to compute a hash synchronously on the main thread.

### 5.4 Add Song insertion contract

`insertTrackAfter(itemInstanceId, trackId)` must operate on the mutable working setlist.

It must not call AudioEngine.stop/load/rebuild.

Bottom `ADD SONG` uses `appendTrack(trackId)`.

## 6. Setlist session architecture

### 6.1 Saved vs working state

When a saved setlist opens:

```text
persistent saved record
       ↓ deep clone
working session record
```

All live edits mutate only the working copy.

Track:

```text
workingSetlist
savedSetlistSnapshot
isDirty
```

`isDirty` becomes true when sequence/content differs from saved snapshot.

### 6.2 Explicit Save

Pressing Save:

1. validate working setlist;
2. persist working record over saved record;
3. refresh saved snapshot;
4. set `isDirty = false`;
5. show non-blocking confirmation.

### 6.3 Opening/New with unsaved changes

Before replacing working state:

- if `isDirty === false`, continue;
- if `isDirty === true`, show blocking confirmation:
  - `Discard changes`
  - `Cancel`
- wait for user's choice;
- do not automatically discard.

No automatic working-set crash recovery is required.

### 6.4 Active playback independence

AudioEngine owns an `ActivePlaybackSession` with stable IDs, not an array pointer/index.

Example:

```json
{
  "sessionId": "uuid",
  "trackId": "track-uuid",
  "originatingSetlistItemId": "item-uuid",
  "startedAt": 123.4,
  "state": "playing"
}
```

If the working setlist is mutated:

- the active `trackId` remains unchanged;
- current buffers/media nodes remain unchanged;
- UI can recompute visible row indices independently.

## 7. Audio engine architecture

### 7.1 Non-negotiable lifetime

AudioEngine is a long-lived singleton/service created once after user gesture/audio permission requirements are satisfied.

Do not instantiate it inside row components, drawer rendering, setlist arrays or route components.

Do not tear it down because the drawer opens or a setlist rerenders.

### 7.2 Source modes

Two source modes:

```text
OriginalSourceMode
StemSourceMode
```

#### OriginalSourceMode

Use retained original audio when `stemState !== complete`.

#### StemSourceMode

Use all five synchronized stems when `stemState === complete`.

### 7.3 Stem graph

Conceptual graph:

```text
Vocals source -> gain/mute/solo --\
Guitar source -> gain/mute/solo ---\
Bass source   -> gain/mute/solo ----> master gain -> destination
Drums source  -> gain/mute/solo ---/
Other source  -> gain/mute/solo --/
```

All stems must share the same playback clock/start time.

Mute is gain 0 for the channel.

Solo semantics:

- if no stem is soloed: every non-muted stem plays;
- if one or more stems are soloed: only soloed stems play, subject to defined mute-vs-solo precedence;
- choose a consistent precedence and document it in code/tests. Recommended: Solo selects the audible group; Mute still forces a selected stem silent.

### 7.4 Buffer/media strategy

The implementation may use `AudioBufferSourceNode`, `HTMLAudioElement` bridged into Web Audio, or another browser-safe strategy based on memory constraints.

Requirements matter more than a specific node type:

- sample-accurate or acceptably tight synchronization among five stems;
- seeking keeps stems aligned;
- pause/resume keeps stems aligned;
- next/previous transitions do not leave orphan nodes;
- large tracks do not cause unreasonable memory spikes on tablet.

Because decoding five entire lossless files into memory may be expensive, profile on target tablets before locking a full-buffer strategy.

### 7.5 Transport

Required transport from prototype:

- previous song;
- rewind;
- play/pause;
- fast-forward;
- next song;
- progress/seek bar;
- elapsed time;
- duration;
- now-playing/next labels.

Rewind/fast-forward behavior should be a deterministic seek interval (for example 5 or 10 seconds) stored as a constant, not arbitrary UI hacks.

### 7.6 Next-track resolution

When current song ends or user presses Next:

1. look up current active setlist item identity if still present;
2. resolve the next playable item from the latest working setlist ordering;
3. if a Break is next, enter break state and do not auto-play through it;
4. if current row was removed, resolve sensibly from the latest sequence without stopping the song at removal time.

Edge cases must have tests.

### 7.7 Playback changes during import/list editing

The following functions are forbidden from invoking stop/load on AudioEngine as a side effect:

- list insert;
- list remove;
- reorder;
- break edit;
- file picker open/close;
- import copy;
- saved-state dirty tracking;
- list rerender.

## 8. Track Editor architecture

### 8.1 Empty open

Opening Track Editor from the cog opens an empty editor view.

It does not automatically bind to the current performance track.

### 8.2 Track selection

The user can choose:

- existing internal LiveSet track; or
- external audio file.

Existing track loads:

- original audio info;
- title/artist/genre;
- cifra;
- stem status;
- saved performance settings;
- any generated stems.

### 8.3 Save without split

`SAVE TRACK` must work even if no split has ever been run.

For a new external file:

- import original to OPFS;
- create/update metadata;
- save cifra;
- `stemState = none`.

For existing track:

- update metadata/cifra/settings;
- do not delete stems unless explicitly replaced.

### 8.4 Re-split replacement transaction

Do not write new outputs directly over valid stems while inference is still running.

Use:

```text
/temp/splits/<job-id>/vocals...
...
```

Then:

1. generate all five;
2. validate all five;
3. user has already confirmed replacement warning;
4. swap old files atomically/transactionally as closely as OPFS permits;
5. update track record;
6. delete temp and old files after success.

If inference fails, old valid stems remain.

## 9. Stem separation architecture

### 9.1 Runtime

Use ONNX Runtime Web with WebGPU execution provider.

The model is the simple five-stem model used for:

- Vocals
- Guitar
- Bass
- Drums
- Other

Model-specific tensor/audio preprocessing must be encapsulated in StemSeparationService. Do not scatter model assumptions throughout UI code.

### 9.2 Model availability

The PWA must clearly know whether required model assets are available locally.

Recommended states:

```text
not-downloaded
loading
ready
error
```

If initial model payload is too large for normal app-shell cache, use explicit first-run/model asset caching into OPFS/Cache Storage and expose progress.

V1 offline splitting is only considered ready after the model/runtime assets are confirmed local.

### 9.3 Worker usage

Audio preprocessing/postprocessing and other heavy non-GPU work should use Web Workers where practical to keep UI responsive.

Do not block the main thread for long PCM conversions or archive/hash operations.

### 9.4 GPU capability detection

Before allowing split:

- detect WebGPU availability;
- initialize ONNX WebGPU session;
- show a clear unsupported/error state if unavailable.

Do not silently run a catastrophically slow CPU fallback unless explicitly designed and tested.

Required V1 target devices are expected to support the chosen route, but actual hardware/browser compatibility must be tested.

### 9.5 Processing jobs

Each job should have:

```json
{
  "id": "uuid",
  "trackId": "uuid-or-null",
  "status": "queued|preparing|loading-model|running|encoding|validating|complete|failed|cancelled",
  "progress": 0.0,
  "error": null
}
```

UI progress should reflect real phases, not the prototype's fake timer.

### 9.6 During active playback

Heavy stem processing can compete for GPU/CPU/memory with performance playback.

Before starting a separation job while music is actively playing, show a warning such as:

> Splitting a track can heavily load this device and may affect live playback. Stop splitting or continue at your own risk.

Do not automatically stop current music.

## 10. Audio output format for generated stems

The architecture should preserve audio fidelity and browser decodability while minimizing unnecessary storage.

Implementation must choose one consistent internally generated stem format supported by required platforms.

Selection criteria:

- reliable browser decoding on Android Chrome and iPad Safari/PWA;
- seekability;
- synchronization behavior;
- storage footprint;
- encoding availability in-browser;
- quality sufficient for PA playback.

Do not assume M4A/FLAC is universally safe without target-device testing.

Record the chosen format and test evidence in `progress.md`.

## 11. Cifra parser architecture

### 11.1 Preserve source

Always retain raw `cifraSource`.

### 11.2 Parse model

Suggested parsed representation:

```json
{
  "sections": [
    {
      "label": "Verse",
      "rows": [
        {
          "chordLine": "Am        F             C",
          "lyricLine": "Some lyric text appears here",
          "chords": [
            {"symbol": "Am", "column": 0},
            {"symbol": "F", "column": 10},
            {"symbol": "C", "column": 24}
          ]
        }
      ]
    }
  ],
  "uniqueChords": ["Am", "F", "C"]
}
```

Parser must handle:

- section labels like `[Intro]`, `[Verse]`, `[Chorus]`;
- chord-only lines;
- lyric lines;
- blank lines;
- repeated sections;
- chord symbols with sharps/flats/slashes/extensions;
- plain lyrics with no chords.

### 11.3 Chord-line classification

Do not classify every short text line as chords.

Use a chord-token grammar and a threshold of recognized tokens vs other text.

Preserve ambiguous source if classification confidence is low.

## 12. Chord diagram architecture

### 12.1 Offline-first

Bundle all required runtime code and fingering data locally.

No network lookup in the rendering path.

### 12.2 Components

```text
ChordSymbolParser
      ↓ normalized symbol
ChordFingeringResolver
      ↓ one preferred fingering
ChordDiagramRenderer
```

### 12.3 Fingering source

Use an open-source/local dataset or package that can legally be bundled and provides sufficient common guitar chord fingerings.

The final dependency must be audited for:

- license;
- bundle size;
- offline operation;
- supported symbols;
- no hidden API dependency.

### 12.4 Unknown chord

If resolution fails:

- keep chord text in cifra;
- omit/mark unavailable diagram;
- never throw in the performance render loop.

## 13. `.liveset` package format

### 13.1 Container

Use a ZIP-compatible archive with `.liveset` extension.

Do not rely on users manually opening/editing it.

### 13.2 Manifest

Root file `manifest.json`:

```json
{
  "format": "LiveSet1",
  "formatVersion": 1,
  "packageType": "track|setlist",
  "createdAt": "ISO-8601",
  "appVersion": "...",
  "rootId": "uuid"
}
```

### 13.3 Track package layout

```text
manifest.json
track.json
media/original.<ext>
media/stems/vocals.<ext>    optional as a complete set only
media/stems/guitar.<ext>
media/stems/bass.<ext>
media/stems/drums.<ext>
media/stems/other.<ext>
```

If stems are included, package validation requires all five.

### 13.4 Setlist package layout

```text
manifest.json
setlist.json
tracks/<track-id>/track.json
tracks/<track-id>/media/original.<ext>
tracks/<track-id>/media/stems/...   optional complete set
...
```

### 13.5 Import validation

Before committing package contents:

- validate ZIP/archive structure;
- validate manifest format/version;
- reject path traversal (`../` etc.);
- validate maximum reasonable file counts/sizes;
- verify referenced track files exist;
- verify complete five-stem invariant if marked stem-enabled;
- deduplicate against existing local tracks;
- import into temp OPFS path;
- commit only after validation.

### 13.6 Export size

Complete setlists may be large.

Export must be streamed/chunked where library/platform APIs allow rather than building multiple full copies in RAM.

## 14. Service Worker / PWA

### 14.1 App shell

Cache:

- HTML shell;
- CSS;
- JS modules/bundle;
- icons/logo;
- chord dataset/renderer assets;
- small static dependencies.

### 14.2 Model assets

Large ML model assets may use a dedicated cache/OPFS download flow rather than naïve precaching.

### 14.3 Update policy

Do not let a service-worker update unexpectedly reload the app during a gig.

Recommended behavior:

- download new app version in background;
- show `Update available`;
- activate/reload only when user chooses and no critical performance is in progress.

### 14.4 Offline readiness indicator

Provide a way to know whether:

- app shell is offline-ready;
- stem model is offline-ready.

## 15. View/state architecture

### 15.1 Performance view

Performance view reads:

- working setlist;
- active playback session;
- active track metadata;
- cifra parsed data;
- track settings.

It does not own persistent data directly.

### 15.2 Track Editor view

Track Editor operates through TrackService/StemSeparationService.

### 15.3 Dirty-state scopes

Two different save semantics exist and must not be conflated:

- **Setlist dirty state**: explicit Save required.
- **Track performance preference** such as cifra scroll speed: save immediately as last-used track setting.

## 16. UI performance and concurrency

### 16.1 Avoid synchronous large-file work

Move to Worker or chunk:

- hashing;
- ZIP generation/extraction;
- PCM preprocessing;
- waveform extraction if added;
- large JSON serialization where meaningful.

### 16.2 DOM updates

Setlist changes should patch/re-render list UI without reconstructing the player footer/audio engine.

### 16.3 Memory discipline

Release object URLs, decoded buffers and worker buffers when no longer needed.

Do not retain both original and all five decoded stem buffers for many tracks simultaneously.

Preload only the active/next track as justified by memory measurements.

## 17. Error handling

User-facing errors must identify what the musician can do.

Examples:

- selected audio format cannot be decoded on this device;
- not enough storage to import/split/export;
- WebGPU unavailable;
- stem model not available offline;
- stem job failed; original track is unchanged;
- incomplete `.liveset` package;
- imported set contains missing track media;
- browser storage permission/quota failure.

Never silently delete a valid original or previous stem set because a new operation failed.

## 18. Storage quota management

Because stems multiply storage usage, provide at least basic storage awareness.

V1 should:

- estimate storage before starting a large split/export where possible;
- call storage estimate APIs where supported;
- fail early with a clear message rather than filling storage mid-transaction;
- remove temporary files after success/failure;
- avoid duplicate copies per setlist.

A full storage-manager screen is optional unless added later.

## 19. Security / data integrity

Although this is a local app:

- sanitize text before injecting cifra/metadata into DOM;
- never execute imported JSON/HTML;
- treat `.liveset` as untrusted archive input;
- prevent archive path traversal;
- validate schema before use;
- use UUIDs/stable IDs rather than filenames as database keys;
- do not allow a filename such as `../../x` to control OPFS path layout.

## 20. Capacitor future compatibility

V1 remains PWA-first.

Architect services behind interfaces so later Capacitor adapters can replace browser-specific pieces without rewriting product logic:

```text
StorageAdapter
FilePickerAdapter
ShareExportAdapter
AudioOutputAdapter (only if needed)
```

Do not add Capacitor now merely for future-proofing unless explicitly required by build deployment.

## 21. Testing architecture

At minimum create automated tests for pure logic:

- cifra parsing;
- chord token parsing;
- setlist insert/remove/reorder;
- dirty-state comparisons;
- next-track resolution after mutations;
- schema validation;
- `.liveset` manifest validation;
- stem-completeness detection.

Use browser integration/E2E tests for:

- continuous playback while setlist mutates;
- file import;
- IndexedDB/OPFS persistence;
- PWA offline shell;
- actual five-stem synchronized playback;
- export/import round trip.

## 22. Browser/platform validation matrix

Maintain a table in `progress.md` with actual tested devices/versions.

Required minimum categories:

| Platform | Install PWA | Offline shell | Import audio | Original playback | 5-stem playback | WebGPU split | Export/import | Chords |
|---|---|---|---|---|---|---|---|---|
| Android tablet | required | required | required | required | required | required on supported target | required | required |
| iPad | required | required | required | required | required | required on supported target | required | required |
| Windows | target | target | target | target | target | target | target | target |
| Phones | best effort V1 | best effort | best effort | best effort | best effort | device-dependent | best effort | best effort |

## 23. External technical references used to validate architecture

The chosen architecture is consistent with current primary documentation:

- ONNX Runtime Web provides a WebGPU execution provider for browser inference.
- OPFS is application-private storage optimized for file access and is not user-visible like the normal filesystem.
- WebKit implements OPFS as part of its File System API support.
- PWA/Service Worker technology is appropriate for offline/installable browser applications.

Do not turn these references into runtime dependencies. They are architectural validation only.

