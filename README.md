# LiveSet 1

[Live demo](https://acleitao-projects.github.io/LiveSetApp/)

Local-first PWA for live-performance musicians. Pick an audio file, get lyrics with chords and diagrams, build a set list, and edit that set list freely while the current song keeps playing.

Name inspired by Capture One — for the stage, not the studio.

## Run locally

From this directory:

```powershell
python -m http.server 4173 --bind 0.0.0.0
```

Open `http://127.0.0.1:4173/`. Run the automated suite with:

```powershell
npm test
```

There are no build steps and no runtime dependencies. It is a static site.

## What it does

- **Pick a song from your device** — no import ceremony. On Android and desktop Chrome the app remembers the file across launches (File System Access API). On iPad/iPhone Safari the audio is silently copied into browser storage.
- **Build a set list** — songs and breaks, drag to reorder, save when you want.
- **Play through the set list** — full transport (prev / rewind / play·pause / forward / next), space bar toggles play.
- **Edit any song's lyrics + chords** from the setlist row. Import `.txt` or `.cho`. Cifra edits, transpose, and scroll speed save immediately per song — even if you never save the set list itself.
- **Transpose** ± semitones on the Performance screen. Original cifra text is never modified; transposition happens on display.
- **Chord diagrams** rendered offline from a bundled vocabulary; unknown chords fall back to a text card.
- **Auto-scroll** with a live speed slider. Speed is persisted per song.
- **Fullscreen** mode collapses everything to cifra + a floating play/pause pill.
- **Playback invariant** — the audio never stops when the set list changes. Add, remove, reorder songs or breaks, edit a song's cifra, transpose, change speed: the current playback continues untouched.

## What it deliberately does not do

- No AI stem separation. Removed in v0.2 — the target devices (tablets/phones) can't run it reliably.
- No song library screen, no import workflow, no track editor as a separate view.
- No `.liveset` export/import package format.
- No cloud, accounts, or sync.

## Layout

- `src/app-v2.js` — application shell + all views + event handling.
- `src/audio.js` — long-lived `AudioEngine` wrapping a single `<audio>` element.
- `src/song-service.js` — song picking (FS Access API + OPFS fallback), dedupe, persistence.
- `src/storage.js` — IndexedDB + OPFS wrappers.
- `src/models.js`, `src/setlist.js` — Song / Setlist schemas + stable-ID mutations.
- `src/cifra.js`, `src/chords.js`, `src/transpose.js` — parsing, diagrams, transposition (pure).
- `src/icons.js` — inline SVG icon set.
- `src/app.css`, `src/performance.css` — dark obsidian design system, amber accent.
