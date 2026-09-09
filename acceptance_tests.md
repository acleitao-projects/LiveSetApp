# LiveSet 1 — Acceptance tests

Manual acceptance scenarios for v0.2. Automated coverage is `npm test`.

## S1. Add a song

1. Open the app on Chrome desktop.
2. Open the set list drawer, tap ADD SONG, pick an audio file from the OS.
3. The song row appears with the file's name as title and the file's name as subtitle.
4. Tap the row → the song plays. Transport shows elapsed time advancing.

## S2. Cifra edit

1. Tap the pencil icon on a song row.
2. Type or paste `[Intro]\nAm  F  C  G\n\n[Verse]\nLine one\n`.
3. Save. Sheet closes.
4. Play the song → cifra renders with chord row above the empty line and section header in accent color.

## S3. Import .txt cifra

1. Open the edit sheet for a song.
2. Tap `IMPORT .TXT / .CHO`, pick a text file with a cifra.
3. Textarea contents are replaced with the file's text.
4. Save → the imported cifra shows on the Performance screen.

## S4. Transpose

1. Play a song with a cifra containing `Am F C G`.
2. Tap the `+` transpose button twice → indicator shows `+2`, chords render as `Bm G D A`, chord diagrams update.
3. Reload the page → transpose is still `+2` on that song.

## S5. Playback invariant during list edits

1. Start playing song A.
2. Open the drawer. Reorder upcoming songs. Add a break. Remove an upcoming row. Edit the break's minutes.
3. Song A continues to play throughout. Time keeps advancing. `document.querySelector('#app').dataset.engineId` and `sessionId` are unchanged.

## S6. Playback invariant during cifra edit

1. Start playing song A.
2. Tap the pencil icon on A's row. Type in the cifra field. Save.
3. Song A is still playing at the expected time.

## S7. Playback invariant during transpose / speed

1. Start playing.
2. Tap transpose + / -. Move the auto-scroll speed slider.
3. Playback continues at the same `currentTime` trajectory.

## S8. Break behaviour

1. Set list: song A → break → song B.
2. Play A. Let it end.
3. Performance screen shows the break header. Neither A nor B is playing.
4. Tap Play or Next → B starts.

## S9. Dedupe

1. Add a song, edit its cifra, transpose it +3, save the set list.
2. Add the same file again (any set list).
3. The Song appears with the previous cifra and `+3` transpose already applied.

## S10. Save semantics

1. Open a saved set list. Add a song. Do NOT press SAVE.
2. Reload the page.
3. The added song is gone; the set list is exactly as it was.
4. Transpose and scroll speed edits made in step 1 on any song are still there (they persist immediately, independent of setlist SAVE).

## S11. Fullscreen

1. Play a song.
2. Tap the fullscreen icon in the top bar.
3. Only cifra + a floating play/pause pill are visible.
4. Escape or the exit chip returns to the standard view. Playback is unaffected.

## S12. Offline

1. Load the app, register the service worker, add a song via the OPFS-copy path (iPad Safari or the input fallback).
2. Turn off the network.
3. Reload — the app loads from cache. Play — audio plays from OPFS.

## S13. Phone layout

1. Open the app on a phone-width viewport.
2. Chord rails collapse into a horizontal strip above the cifra.
3. Transport is still centered and thumb-reachable. Play button remains large.
4. Drawer and edit sheet become full-screen.
