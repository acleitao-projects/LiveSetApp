# LiveSet 1 — Features

Feature list matched to the v0.2 implementation. Each section names the responsible module.

## Performance screen (`src/app-v2.js`, `src/performance.css`)

- **Song header**: current title (big), artist / filename underneath, and a `NEXT ›` chip showing the upcoming item (tap = same as ⏭).
- **Cifra**: whitespace-preserved parsed rendering with paired chord-over-lyric rows, section labels, chord tokens visually distinct from lyrics. Empty state when a song has no cifra.
- **Chord rails**: unique chords in source order, split across two side rails on tablet, collapsed into a scrollable row above the cifra on phones. Currently-scanned chord glows amber.
- **Control strip**: transpose ± with numeric value, full transport (prev / rewind 10s / play·pause / forward 10s / next), auto-scroll toggle, speed slider (0×–5×, 0.25× steps). Play button uses an amber gradient and is the largest touch target.
- **Time / progress bar**: only shown while a session is active; click to seek.
- **Fullscreen**: hides the top bar, song header, chord rails, and control strip; keeps cifra + a floating play/pause pill. Escape or the exit chip returns.

## Set list drawer (`src/app-v2.js`, `src/app.css`)

- Slides in from the left; audio never stops.
- Header: `NEW`, `OPEN SET LIST…` dropdown (unsaved sets are labeled), `SAVE` (enabled only when dirty).
- Summary: song count, item count, total duration, dirty indicator.
- Rows: drag handle, track number, title + artist, edit (pencil) button, remove button. Whole row body is a tap-to-play target. Currently-playing row shows an amber vertical bar + subtle tint. Break rows use a dashed border with editable minutes.
- Bottom bar: `ADD SONG` (opens picker), `ADD BREAK`.

## Song picking (`src/song-service.js`)

- **Android / desktop Chromium**: `showOpenFilePicker`, the resulting `FileSystemFileHandle` is stored on the Song record. Playback re-requests permission on first read after page load.
- **iOS Safari / others**: `<input type=file>`, file bytes copied into `liveset/songs/{id}/original.{ext}` in OPFS.
- **Dedupe**: if the picked file's filename + size match an existing Song, that Song is reused (its cifra, transpose, and speed follow). No user-visible library screen.

## Cifra edit sheet (`src/app-v2.js`)

- Opens from the pencil icon on any setlist row. Slides in from the right on tablet, full-screen on phone.
- Fields: title, artist, cifra textarea (monospace, whitespace preserved).
- `IMPORT .TXT / .CHO` button replaces the current textarea content with the imported file's text.
- Save writes the song record immediately (`saveMetadata` + `saveCifra`). Playback is untouched.

## Transpose (`src/transpose.js`)

- ± buttons on the Performance screen, capped at ±12 semitones, saved immediately per song.
- Original `cifraSource` never mutated; transposition runs on parsed chord tokens and chord rails on every render.
- Sharps by default. Handles slash-chord bass (`G/B` → `A/C#`). Non-chord tokens pass through unchanged.

## Auto-scroll (`src/cifra-scroll.js`)

- Sub-pixel accumulation supports smooth movement below 1× speed.
- Speed slider is 0.00×–5.00× in 0.25 steps.
- Setting and toggle persist per song, independent of setlist SAVE.

## Chord diagrams (`src/chords.js`)

- Bundled, application-owned vocabulary (open shapes + movable minor-seventh voicings for every chromatic root). No external dataset, no runtime download.
- Unknown chords fall back to a text card.

## Setlist persistence (`src/setlist.js`, `src/app-v2.js`)

- Working set is a deep clone of the saved snapshot. `isDirty(working, saved)` drives the SAVE button state and the discard-changes confirmations.
- `resolveNext` / `resolvePrevious` use `lastKnownOrder` so removing the currently playing row still resolves the correct next row.

## Offline / PWA (`sw.js`, `manifest.webmanifest`)

- Precached shell. Update-sensitive requests are network-first with cached fallback.
- Update-ready pill appears when a new SW is waiting; user chooses when to reload.
- Manifest advertises the SVG logo plus 192/512 PNG icons.

## Accessibility

- All interactive elements keyboard-reachable. Space toggles play/pause outside inputs. Escape exits fullscreen.
- `prefers-reduced-motion` disables the ease-out animations.
