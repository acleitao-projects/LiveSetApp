# LiveSet 1 — Product

## Users

Live-performance musicians running a set on a tablet on stage. Sweaty hands, low light, tight timing between songs. Sometimes on a phone as a fallback.

## Target platforms

1. **Tablet (primary)** — Android Chrome and iPad Safari, installed as a Home Screen PWA.
2. **Phone (must remain readable)** — same browsers.
3. **Desktop Chrome** — for setup and preparation; not the performance surface.

## Workflow

1. **Setup (at home, before the gig).** Open the app. From the set list drawer, tap ADD SONG and pick an audio file. Repeat. For each song, tap the pencil icon to open the edit sheet, paste (or import a `.txt`/`.cho`) the cifra, edit title/artist, save. Reorder rows by dragging. Add breaks. Save the set list.
2. **Sound check.** Open the set list. Tap a song row to play it. Adjust transpose. Save the transpose and scroll-speed — they persist automatically.
3. **The gig.** Play. The current song keeps playing while the musician opens the drawer, reorders upcoming songs, removes songs, edits break lengths, or opens a cifra edit sheet. When the current song ends, the app advances to the next item, stopping at breaks.

## Terminology

- **Song** — a persistent record for one audio file: title, artist, source (device handle or OPFS copy), cifra text, transpose, auto-scroll settings.
- **Set list** — an ordered list of items. Each item is either a track reference (points to a Song by id) or a break.
- **Break** — a pause item with a duration in minutes and a label. Sequence stops on a break; user must Play/Next to resume.
- **Cifra** — lyrics with chord lines above them, in the informal Brazilian format. Also accepts ChordPro-style content.

## Scope in

- Set list creation, editing, saving, opening.
- Live editing of the set list during playback without interrupting audio.
- Per-song cifra editing (paste text or import `.txt`/`.cho`).
- Transpose ± 12 semitones per song, saved immediately.
- Auto-scroll with speed slider, saved immediately.
- Chord diagrams rendered offline from a bundled vocabulary.
- Fullscreen cifra mode.
- Offline operation (PWA + service worker + IndexedDB + OPFS).

## Scope out (deliberately removed in v0.2)

- Local stem separation and stem playback.
- Track editor as a separate view.
- Library / "import first, use later" workflow.
- `.liveset` package export/import.
- Cloud, accounts, sync, remote.

## Hard rules

- **Playback continues through every set list mutation.** No exceptions.
- **Transpose and cifra scroll speed persist immediately.** They live on the Song record, not on the setlist working state.
- **Set list mutations are temporary until the user presses SAVE.** Reloading discards unsaved changes.
- **No internet is required for core operation.**
- **On iOS the audio is copied into OPFS.** On Android/desktop Chrome the file handle is remembered and the file is read in place.
