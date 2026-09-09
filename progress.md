# LiveSet 1 — Implementation Progress

> **v0.2 reset (2026-09-09).** The app was over-scoped and did not function for the intended musician + tablet workflow. The AI stem separation pipeline never worked on target devices, and the library-import ceremony was friction the user rejected. Everything below this section documents the prior v0.1 architecture and is retained for historical context only — it does not describe the current codebase.

## v0.2 reset — 2026-09-09

**Removed (kill list):**
- AI stem separation: `src/stem-*.js`, `src/model-asset-service.js`, `src/m4a-media.js`, ONNX Runtime Web, Mediabunny.
- `.liveset` package format: `src/liveset-package*.js`, fflate vendor lib.
- `src/track-service.js`, `src/app.js`, `src/ui-runtime-fixes.js`, `splitstem.html`, `preview.html`, `qualification/`, stem/liveset/stress tests.
- All old CSS files (`app.css`, `refinement.css`, `brand.css`, `editor.css`, `performance-v1.css`, `scrollbar.css`) and `logo.png`.
- Track Editor view, EXPORT/IMPORT .LIVESET, TRACK EDITOR drawer buttons, source-chooser modal, library modal, stem controls, model UI, WebGPU/HTTPS/OPFS capability panels.

**Added / reworked:**
- `src/models.js` — new `Song` schema (schemaVersion 2), setlist item now stores `songId`.
- `src/storage.js` — trimmed to IndexedDB (`songs`, `setlists`, `appSettings`) + OPFS wrapper; capability detection includes File System Access API.
- `src/song-service.js` — new. `pickAndRegisterSong` branches on FS Access API vs `<input type=file>` + OPFS copy. Dedupes by filename+size. Immediate save for cifra/metadata/transpose/scroll settings.
- `src/transpose.js` — new. Pure `transposeChordToken` / `transposeChordLine`, sharps by default, handles slash bass, non-chord tokens pass through.
- `src/audio.js` — simplified to a single long-lived `<audio>` element engine. `snapshot()` diagnostics retained. All stem code removed.
- `src/icons.js` — new inline SVG icon set replacing unicode glyphs.
- `logo.svg` — new "LS·1" wordmark with amber play triangle. `logo.png` deleted.
- `src/app.css`, `src/performance.css` — brand-new design system. Dark obsidian background, amber (#F5A524) accent, big touch targets, tablet-primary + phone-tolerant layout, dedicated fullscreen mode.
- `src/app-v2.js` — full rewrite. New shell: top bar → song header → cifra body → control strip (transpose · transport · scroll controls). Set list drawer with row-level edit/remove/drag, direct ADD SONG picker, break rows. Per-song cifra edit sheet with `.txt`/`.cho` import.
- Manifest / theme color updated to `#0A0A0F`. Service worker cache bumped to `v40`, precache list rewritten.
- Docs replaced: `README.md`, `product.md`, `architecture.md`, `features.md`, `acceptance_tests.md`.
- Tests: `test/setlist.test.js` updated for `songId`; added `test/transpose.test.js` (8 cases). Removed stem/liveset/stress/track-service tests. Full run: **20 passed, 0 failed**.

**Behavioral guarantees preserved:**
- `AudioEngine` singleton across renders; `<audio>` element lives outside the rendered DOM tree.
- Set list mutations use stable IDs and never touch the engine.
- Cifra scroll speed persists immediately per song; transpose now behaves the same way.

**Remaining before v1 sign-off:**
- Manual acceptance run on real Android Chrome tablet.
- Manual acceptance run on real iPad Safari (Home Screen PWA + OPFS-copy path).
- Manual acceptance run on real phone-width viewport.
- Regenerate the 192/512/maskable PNG icons from `logo.svg` (currently the manifest advertises the SVG plus the old PNGs; browsers that ignore SVG icons will still show the old artwork).

---

## Historical (v0.1) — retained for context

> Codex: keep this file current. Do not mark an item complete because the UI exists. Mark complete only when the behavior is implemented and relevant acceptance tests pass.

## Status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete and tested
- `[!]` Blocked / known issue — explain below

## 0. Project bootstrap

- [x] Create single PWA application shell.
- [ ] Preserve prototype visual system.
- [x] Establish module structure.
- [x] Add app manifest.
- [x] Add service worker.
- [ ] Confirm local dev HTTPS/secure-context setup where required.
- [ ] Confirm no backend is required for core operation.
- [x] Add application/schema version constants.

### Notes

- Date:
- Commit:
- Issues:

## 1. Storage foundation

- [x] IndexedDB wrapper created.
- [x] OPFS wrapper created.
- [x] Track schema implemented.
- [x] Setlist schema implemented.
- [x] UUID/stable IDs implemented.
- [ ] Atomic-ish temp/commit helpers implemented.
- [ ] Storage estimate/quota handling implemented.
- [ ] Temp cleanup implemented.
- [ ] No localStorage usage for media blobs.

### Tests

- [ ] Track record survives reload.
- [ ] Media asset survives reload.
- [ ] Setlist survives reload.
- [ ] Failed write does not leave valid-looking DB record pointing to missing media.

## 2. Track import / library service

- [ ] System file picker for browser-supported audio.
- [ ] Decode/probe selected file.
- [ ] Friendly unsupported-format error.
- [ ] Import original to OPFS.
- [ ] Create Track record.
- [ ] Plain imported track gets red/no-stems state.
- [ ] Dedup strategy implemented.
- [ ] Internal track reuse does not duplicate bytes.
- [ ] Large import avoids unnecessary main-thread blocking.

### Tests

- [ ] `acceptance_tests.md` B1.
- [ ] B2.
- [ ] K2.

## 3. Setlist persistent model and working-session model

- [ ] Saved setlist repository.
- [ ] Deep-cloned working set on open.
- [ ] Dirty-state detection.
- [ ] Explicit Save.
- [ ] No setlist autosave.
- [ ] Unsaved warning before New/Open/replacement.
- [ ] Wait for user choice.
- [ ] New setlist.
- [ ] Open setlist selector.
- [ ] Save setlist.
- [ ] Track items reference Track IDs.
- [ ] Break items implemented.
- [ ] No crash-recovery autosave of unsaved working set (intentionally not required).

### Tests

- [ ] D1.
- [ ] D2.
- [ ] D3.
- [ ] D4.

## 4. Performance UI bound to real state

- [ ] Header uses current set/track metadata.
- [ ] Burger drawer uses real working set.
- [ ] Set summary real.
- [ ] Track status badges real.
- [ ] Active row real.
- [ ] Bottom transport uses real state.
- [ ] Next label resolves from working set.
- [ ] Prototype's four-stem control corrected to five stems.
- [ ] Tablet responsive behavior preserved.

## 5. Audio Engine — original tracks

- [ ] Long-lived AudioEngine singleton/service.
- [ ] Original audio load.
- [ ] Play/pause.
- [ ] Seek/progress.
- [ ] Rewind.
- [ ] Fast forward.
- [ ] Previous song.
- [ ] Next song.
- [ ] Ended handling.
- [ ] Break-aware next resolution.
- [ ] Active playback identified by stable session/track IDs, not list index.
- [ ] UI rerenders do not recreate AudioEngine.

### Tests

- [ ] Plain track plays offline.
- [ ] Seek works.
- [ ] Next/previous work.
- [ ] Reordering above current does not change active song.

## 6. CRITICAL: live setlist editing during playback

This block is release-critical.

- [ ] Open drawer while playing without stopping/restarting.
- [ ] Close drawer while playing without stopping/restarting.
- [ ] `+` on a song row inserts chosen track immediately below that row.
- [ ] Bottom Add Song appends.
- [ ] Import while playing does not intentionally pause/stop.
- [ ] Remove upcoming row without interrupting.
- [ ] Remove active row without interrupting active audio.
- [ ] Reorder rows without interrupting.
- [ ] Add break without interrupting.
- [ ] Remove break without interrupting.
- [ ] Reorder break without interrupting.
- [ ] Edit break duration without interrupting.
- [ ] Next resolution uses latest working set after mutations.
- [ ] No list mutation calls AudioEngine stop/load/recreate.

### Mandatory acceptance evidence

- [ ] C1 Wonderwall-under-Creep scenario PASSED.
- [ ] C2 PASSED.
- [ ] C3 PASSED.
- [ ] C4 PASSED.
- [ ] C5 PASSED.
- [ ] C6 PASSED.
- [ ] K3 PASSED.

### Evidence / notes

Record logs/video/test IDs here.

2026-08-11: `npm test` passes stable-ID mutation/navigation tests. Local browser verification loaded the Performance shell, opened/closed the drawer, and inserted a Break without affecting the rendered player. Full active-audio mutation acceptance scenarios remain unverified because no audio fixture or target device session is present yet; do not mark them complete.

2026-08-11 desktop acceptance work: Added deterministic WAV fixture generation under `test/fixtures.mjs`, fixture validity test, AudioEngine snapshot/metrics observability, and stable-ID end-of-track resolution using the active session's last-known order. Browser smoke verification on the local HTTP server imported three fixtures, displayed them in the working setlist, inserted tracks with row `+`, removed a row, added breaks, and opened/closed the drawer with no browser console errors. Full playback-invariant assertions did not pass: the current browser run did not expose a usable active playback session after the fixture import flow, so active audio continuity, current-row removal-to-completion, reorder, and Next/Previous assertions remain unverified.

2026-08-11 playback blocker diagnosis: The missing session was caused by the browser test selector matching both the transport Play button and row-level `PLAY`; the test aborted before production playback was invoked. With `name: 'PLAY', exact: true`, a real imported WAV produced a live UI session (`Audio session …`, `Ⅱ`, advancing `0:02 / 0:30`) with no console errors. Eight-second fixtures were also too short for the full mutation sequence and were extended to 30 seconds. Active-row removal reached the next track after natural completion. Explicit Next/Previous now also use the active session's `lastKnownOrder` through a delegated stable-ID handler. Full invariant capture remains limited by the browser test surface not exposing the module diagnostic hook.

## 7. Break feature

- [ ] Add Break.
- [ ] Default 15 minutes.
- [ ] Duration editable.
- [ ] Range validation.
- [ ] Drag/reorder.
- [ ] Remove.
- [ ] Break persists only after Setlist Save.
- [ ] Sequence stops at Break rather than auto-playing through.

## 8. Track Editor basic mode — no splitter yet

- [x] Track Editor opens empty from cog.
- [x] Select existing LiveSet track.
- [x] Browse new external audio.
- [x] Song name editable.
- [x] Artist editable.
- [x] Genre editable.
- [x] Cifra textarea matches prototype styling.
- [x] Raw spacing/newlines preserved.
- [x] Save new track without splitting.
- [x] Save existing edits without splitting.
- [x] Original audio never rewritten just to store metadata.
- [x] Metadata/cifra stored in track record/sidecar, not audio tags.
- [x] Add To Set List supports one or multiple saved setlists.

### Tests

- [x] F1.
- [x] F2.

### Milestone 2 evidence — 2026-08-11

- Added `TrackService` with staged external-file drafts, isolated decode probing, explicit Save persistence, cleanup after failed writes, existing-track metadata updates, and reference-only multi-setlist insertion.
- Automated tests verify exact cifra round-trip (including spacing, tabs, blank lines, CRLF and trailing newline data), no persistence before Save, failed-write cleanup, preservation of existing assets/stems/settings, and stable reference-only insertion into multiple setlists.
- Browser F1/F2 verification used real 30-second WAV fixtures. A new original-only track saved and reopened with title, artist, genre and exact cifra unchanged. Performance rendered the exact escaped string in a `white-space: pre-wrap` monospace `<pre>` with no injected HTML elements.
- Browser multi-setlist verification added the same Track ID to two saved setlists, produced independent item instances, and survived reload. The service-level evidence confirms no Track record or OPFS write occurs during this operation.
- Browser playback-isolation verification: while a real fixture played, navigating to Track Editor, probing another file, editing cifra/metadata, saving, and returning preserved engine ID, graph version, session ID, active Track ID, source identity, volume and playing state; position advanced from approximately 22 to 24 seconds. No console errors.
- Regression result: `npm test` — 13 passed, 0 failed. Android tablet and iPad validation remains pending.

### 2026-08-11 — Track Editor control contrast fix

- Corrected the existing-track selector to request a dark native popup and render options with explicit dark backgrounds and light text.
- Scoped the Add To Set List checkboxes so they no longer inherit full-width modal text-input dimensions; they now render as 24px custom high-contrast controls inside 54px selectable rows.
- Browser verification confirmed dark select/option computed colors, 24×24px checkbox geometry, checked-state interaction, and no console errors. Regression result: `npm test` — 13 passed, 0 failed.

### 2026-08-11 — Scalable existing-track search

- Replaced the Existing LiveSet Track native combo with an immediate search over title, artist, and original filename. Results are accent-insensitive, ranked, keyboard/touch accessible, and capped at 50 instead of rendering the entire library.
- Automated coverage validates ranking and the 50-result cap against a 1,000-track library. Browser verification found and loaded the same Track by title and filename, with no native combo or console errors.
- Changed update-sensitive same-origin navigation, script, and stylesheet requests to network-first with cached offline fallback so service-worker updates cannot mix incompatible module versions.
- Regression result: `npm test` — 14 passed, 0 failed.

### 2026-08-11 — Set List Add From Library extension

- Row `+`, break `+`, and bottom `ADD SONG` now open a source chooser with `ADD FROM DEVICE` and `ADD FROM LIBRARY`; the existing device-file path is unchanged after selecting the device option.
- Added a local dark library modal with immediate partial case-insensitive title/artist search, title/artist result rows, and status badges. Green requires `stemState: complete` plus all five canonical references (Vocals, Guitar, Bass, Drums, Other); all other Tracks are red/original-only.
- Library selection creates only a new stable setlist-item reference to the existing Track ID. Row-origin selection inserts immediately below the clicked stable item; bottom-origin selection appends to the working setlist. No TrackRepository or OPFS write is involved.
- Browser playback verification: row insertion and bottom append preserved engine ID, graph version, session ID, active Track ID, source identity, volume, and playing state while position advanced. No console errors.
- Regression result: `npm test` — 16 passed, 0 failed.

## 9. Cifra parser and performance rendering

- [x] Section label parsing.
- [x] Chord-line classification.
- [x] Common chord token grammar.
- [x] Chord-over-lyric row pairing.
- [x] Plain lyric fallback.
- [x] Raw source preserved.
- [x] Parsed renderer connected to Performance.
- [x] Manual scroll.
- [x] Auto-scroll.
- [x] Last-used speed persisted immediately per track.
- [x] Missing cifra empty state.

### Tests

- [x] H1 — parser test and desktop Chromium DOM evidence.
- [x] H2 — parser test and desktop Chromium DOM evidence.
- [x] H3 — automated persistence test and desktop Chromium reload evidence at 2.75×.
- [x] H4 — automated parser fallback test.

## 10. Five-stem playback engine

- [x] Canonical stems exactly Vocals/Guitar/Bass/Drums/Other.
- [x] Complete-stem validation for Milestone 3 PCM WAV assets.
- [x] Green playback status only after a complete set passes playback preparation.
- [x] Five synchronized worklet outputs using one source-frame cursor.
- [x] Per-stem mute.
- [x] Persist mute state.
- [x] Per-stem solo retained; multiple Solo selections allowed and Mute overrides Solo.
- [x] Original not played simultaneously.
- [x] Incomplete/incompatible stems fall back to original.
- [x] No partial-stem automatic fallback.
- [x] Seeking remains synchronized in desktop browser verification.
- [x] Pause/resume remains synchronized in desktop browser verification.
- [ ] Memory profile acceptable on target tablets.

### Tests

- [x] G3 — desktop browser fixture evidence.
- [x] G4 — unit and desktop reload evidence.
- [x] G5 — incompatible Drums fixture fell back to original on desktop.

## 11. Track controls

- [x] Five stem rows in UI.
- [x] Original-only disabled stem state.
- [x] Playback speed control explicitly excluded from Milestone 3; no cosmetic control shown.
- [x] Tone/transpose explicitly excluded from Milestone 3; no cosmetic control shown.
- [x] Reset behavior defined: clear Mute/Solo only; persistence path covered by TrackService tests.

### DSP decision

- Playback rate implementation:
- Transposition implementation:
- Notes:

## 12. ONNX Runtime Web / WebGPU splitter

- [ ] ONNX Runtime Web dependency integrated.
- [ ] WebGPU execution provider used.
- [ ] WebGPU capability detection.
- [ ] Five-stem model added.
- [ ] Model local-cache strategy implemented.
- [ ] Offline model readiness state.
- [ ] Audio preprocessing implemented.
- [ ] Worker/off-main-thread processing where practical.
- [ ] Real progress phases.
- [ ] Five outputs generated.
- [ ] Output format selected based on Android+iPad testing.
- [ ] Output validation.
- [ ] Write to temp location first.
- [ ] Commit complete stem set only after success.
- [ ] Replacement warning if stems exist.
- [ ] Cancel leaves old stems.
- [ ] Failure leaves old stems.
- [ ] Original retained.
- [ ] Warning when splitting during active playback due to resource load.

### Stem output format decision

- Format:
- Codec:
- Android test:
- iPad test:
- Reason:

### Tests

- [ ] G1.
- [ ] G2.
- [ ] G6.
- [ ] G7.
- [ ] G8.

## 13. `.liveset` package import/export

- [x] ZIP-compatible `.liveset` writer.
- [x] Manifest v1.
- [ ] Track package support if exposed.
- [x] Complete setlist export.
- [x] Includes all referenced originals.
- [x] Includes complete stems when available.
- [x] Includes track metadata/settings/cifra.
- [x] Includes setlist breaks/order.
- [x] User-visible save/download flow.
- [x] Import archive.
- [x] Package-type detection.
- [x] Version validation.
- [x] Path traversal protection.
- [x] Temp import before commit.
- [x] Dedup existing tracks.
- [x] Rollback/cleanup failed imports implemented; forced browser failure remains pending.
- [ ] Large archive memory profile acceptable.

### Tests

- [ ] J1.
- [ ] J2.
- [ ] J3.
- [ ] J4.

## 14. PWA offline hardening

- [x] App shell cached.
- [x] Static chord parser/renderer assets cached.
- [x] Model cached/OPFS resident with verified model state.
- [x] Local media resolves from OPFS without network.
- [x] Update does not force reload during gig.
- [x] Update available UI.
- [ ] App offline readiness test.
- [ ] Model offline readiness test.

### Tests

- [ ] A1.
- [ ] A2.
- [ ] A3.

## 15. Chord diagrams — mandatory final V1 feature

Implement after core features are stable, but must be complete before V1 release.

- [x] Bundled application-owned chord vocabulary chosen (no third-party dataset).
- [x] No external dataset/license dependency introduced.
- [x] Chord symbol normalization.
- [x] Fingering resolver.
- [x] Diagram renderer matching LiveSet visual style.
- [x] Left/right chord rails real.
- [x] Unique chords shown in source order.
- [x] Unknown chord graceful fallback.
- [x] No runtime internet dependency.

### Tests

- [x] I1 — automated resolver/SVG test and desktop Chromium DOM evidence.
- [x] I2 — automated unknown-symbol fallback test.

## 16. Error handling and storage safety

- [x] Unsupported audio error.
- [x] OPFS/IndexedDB error handling with non-blocking shell fallback.
- [x] Quota/storage preflight and failure message.
- [x] WebGPU unavailable message.
- [x] Model unavailable message.
- [x] Split failure preserves existing data.
- [x] Import failure leaves no broken permanent records.
- [x] Temp cleanup.
- [x] DOM text escaping/sanitization.

### Tests

- [ ] K4.

## 17. Performance/stress

- [x] 100-item setlist mutation/duration automated coverage.
- [ ] Large file import while playing acceptable.
- [ ] No repeated AudioContext creation/leak.
- [ ] No object URL leak.
- [ ] Stem buffer memory measured.
- [ ] Split peak memory measured.
- [ ] Export peak memory measured.

## 18. Android tablet validation

Device:

- Model:
- Android version:
- Browser/PWA version:
- RAM:
- GPU/WebGPU info:

Checklist:

- [ ] PWA install.
- [ ] Offline launch.
- [ ] File import.
- [ ] Original playback.
- [ ] Five-stem playback.
- [ ] Continuous list editing playback test.
- [ ] WebGPU split.
- [ ] Cifra.
- [ ] Chord diagrams.
- [ ] `.liveset` export.
- [ ] `.liveset` import.

Issues:

## 19. iPad validation

Device:

- Model:
- iPadOS version:
- Safari/PWA version:
- RAM if known:
- WebGPU info:

Checklist:

- [ ] PWA install/add-to-home-screen.
- [ ] Offline launch.
- [ ] File import.
- [ ] Original playback.
- [ ] Five-stem playback.
- [ ] Continuous list editing playback test.
- [ ] WebGPU split.
- [ ] Cifra.
- [ ] Chord diagrams.
- [ ] `.liveset` export.
- [ ] `.liveset` import.

Issues:

## 20. Windows validation

- [ ] Install/open.
- [ ] Original playback.
- [ ] Stem playback.
- [ ] WebGPU splitter.
- [ ] Import/export.

## 21. Final release gate

Do not declare V1 done until all are true:

- [ ] No fake prototype processing remains.
- [ ] Five stems are canonical everywhere.
- [ ] Plain original-only songs fully supported.
- [ ] Track Editor saves cifra without requiring split.
- [ ] Explicit setlist Save semantics proven.
- [ ] Critical continuous-playback mutation tests pass.
- [ ] Re-splitting cannot destroy old stems on failure.
- [ ] `.liveset` complete setlist export/import passes.
- [ ] Offline chord diagrams pass.
- [ ] Android tablet sign-off complete.
- [ ] iPad sign-off complete.
- [ ] Known limitations documented.
- [ ] README/Product/Architecture/Features reflect final implementation.

## Change log

### 2026-08-13 — Performance auto-scroll correction

- Moved auto-scroll above the cifra and chord rails and replaced the button/default form presentation with a LiveSet-styled accessible toggle and slider.
- Hid visual scrollbars from the cifra and both chord rails while preserving touch, wheel, keyboard, and programmatic scrolling.
- Fixed auto-scroll lifecycle so an enabled Track starts after render/load and unrelated Performance rerenders preserve its scroll position.
- Added persistent `performance.cifraAutoScrollEnabled` with safe defaults for older Tracks. Toggle state and speed save together directly on the Track, independently from setlist Save and without interacting with AudioEngine.
- Added automated coverage for enabled/disabled state and speed round trips.
- Follow-up: fixed speeds below 1.5× by accumulating sub-pixel movement in a floating-point scroll position instead of repeatedly adding fractional values to browser-rounded `scrollTop`. Added low-speed and proportional-speed regression tests.
- Chord resolver follow-up: added movable minor-seventh voicings for every chromatic root, including sharps and flats (`C#m7`, `Ebm7`, etc.), with explicit diagram regression coverage.

### 2026-08-11 — Remaining V1 implementation pass

- Implemented a non-destructive cifra parser with section labels, chord-line classification, chord-over-lyric pairing, plain-lyrics fallback, and common chord grammar. `cifraSource` remains the authoritative byte-for-byte text; parsing is display-only.
- Replaced the plain Performance `<pre>` with a whitespace-preserving parsed renderer, manual scrolling, track-specific auto-scroll, immediate scroll-speed persistence, and missing-cifra state. Desktop Chromium reload retained the tested 2.75× preference.
- Added application-owned offline guitar chord resolution and SVG rendering, two responsive chord rails, source-order deduplication, scroll-driven current-chord highlighting, and graceful unsupported-diagram cards. No remote API, runtime download, or third-party dataset is used.
- Added break-arrival Performance state: natural sequence arrival at a Break does not auto-play through it, displays its configured duration, and requires musician-controlled Play/Next to continue.
- Added local-storage quota preflight/availability reporting, persistent-storage request, install affordance including iPad Add to Home Screen guidance, keyboard Space transport, and a non-forcing update-ready control.
- Service-worker shell cache now includes cifra/chord modules and styling. Existing OPFS media and verified model storage remain network-independent.
- Added 100-item mixed-setlist/repeated-mutation stress coverage and direct cifra scroll-speed persistence coverage.
- Automated result: `npm test` — **39 passed, 0 failed**. Syntax checks passed for the application, cifra/chord modules, and service worker.
- Desktop Chromium browser evidence: original audio played through the production AudioEngine; exact horizontal spaces and line breaks rendered with computed `white-space: pre-wrap`; two chord rails and four offline SVG diagrams rendered; a real session remained active; scroll speed persisted as 2.75× across reload.
- Milestone 4 mobile WebGPU splitting remains deferred exactly as previously recorded. No splitter, M4A, transactional commit, model, or Windows WebGPU implementation was removed or disabled.
- Remaining release sign-off is physical-device acceptance on Android tablet and iPad/Home Screen PWA, plus device-specific long-run memory/thermal/underrun measurements and clean-profile `.liveset` import. These require the user’s target hardware and are not marked complete.

Add dated entries as implementation decisions change.

### 2026-08-11 — Milestone 4 model qualification blocked

- Qualification gate: evaluated openly licensed six-source ONNX candidates for the required local WebGPU-only path. The canonical `StemSplitio/htdemucs-6s-onnx` fp16-weight artifact is MIT-licensed, 136,428,532 bytes, SHA-256 `7ce55792e2231c93fbf92de95f5fd5b3a5e6c89f7db690dfd693e8f1dce56869`, and exposes `mix [1,2,343980]` → `stems [1,6,2,343980]` at 44.1 kHz in Drums, Bass, Other, Vocals, Guitar, Piano order. Its deterministic LiveSet mapping would be Piano + Other → Other.
- Failed evidence: ONNX Runtime Web 1.27.0 with only `executionProviders: ['webgpu']` rejected the canonical graph at session creation because `/real_istft/ConstantOfShape` had no WebGPU provider assignment. No CPU/WASM fallback was enabled.
- Desktop-only evidence: the MIT `kramp/htdemucs-6s-webgpu-onnx` constant-folded derivative, 284,797,240 bytes, SHA-256 `a3f5050696cda4b2344d465123acb21ee699dad7d0634dba1d282497a04ac86a`, loaded on desktop Chromium/NVIDIA WebGPU in 2,487 ms with input `mix` and output `stems`. Inference quality, sustained memory, and tablet performance were not validated.
- Blocking platform evidence: current official ONNX Runtime WebGPU documentation lists out-of-box support for Chrome/Edge on Android but Safari only through Safari Technology Preview. That does not establish a deployable WebGPU-only path for normal iPad Safari/Home Screen, one of LiveSet's required V1 targets. CPU/WASM fallback is prohibited by the approved milestone.
- Result: Milestone 4 is blocked at its mandatory model/platform qualification gate. No Split UI, fake progress, inference service, model download, or stem commit behavior was added. Milestones 1–3 remain unchanged. Android and iPad acceptance was not run, and no Milestone 4 functionality is marked complete.

### 2026-08-11 — Current-iPad WebGPU qualification harness

- Added an isolated, installable HTTPS qualification PWA for current production iPadOS/Safari. It reports secure-context, Home Screen display mode, `navigator.gpu`, adapter information/limits, storage estimate, user agent, exact model byte count and SHA-256, session inputs/outputs, session creation time, one real inference time, sampled output validity, available JS-memory diagnostics, and full runtime errors.
- The harness uses ONNX Runtime Web 1.27.0 and only `executionProviders: ['webgpu']`; no WASM/CPU execution fallback is configured. The model is the desktop-qualified `kramp/htdemucs-6s-webgpu-onnx` artifact, SHA-256 `a3f5050696cda4b2344d465123acb21ee699dad7d0634dba1d282497a04ac86a`.
- Desktop Chromium packaging verification passed: 284,797,240 downloaded bytes, matching checksum, WebGPU session creation in 2,278 ms, real 440 Hz inference in 15,582 ms, exact output dimensions `[1,6,2,343980]`, finite/non-zero sampled output, and no CPU/WASM fallback.
- HTTPS endpoint verification passed with HTTP 200 for the harness and model and exact `Content-Length: 284797240`. The quick-tunnel URL is temporary and depends on the existing port 4173 server and tunnel process remaining active.
- Current production iPadOS Safari and installed Home Screen execution are pending user-run evidence. The prior iPad blocker is not considered resolved or reconfirmed until that actual result is captured. Full splitter implementation has not started.

### 2026-08-11 — Milestone 4 production implementation (desktop evidence)

- Device gate update: the user reported that the qualification harness passed on the required current production iPadOS/Safari target. The earlier documentation-only iPad blocker is superseded. Detailed iPad timing/memory JSON was not supplied, so full on-device split performance remains pending.
- Added the qualified immutable model manifest and pinned ONNX Runtime Web 1.27.0 local assets. Added explicit WebGPU/HTTPS/OPFS capability states, storage checks, verified OPFS model download/cache, exact byte-count and SHA-256 validation, and no CPU/WASM inference fallback.
- Added a long-lived separation service with queued/preparing/loading-model/running/encoding-writing/validating/committing/complete/failed/cancelling/cancelled states. Added a dedicated WebGPU worker that reads bounded PCM WAV slices, performs shared-phase input resampling to the model's 44.1 kHz timeline, runs model-defined 7.8-second chunks with 25% overlap, maps Piano + Other into canonical Other while retaining independent Drums, resamples all outputs on one shared 48 kHz phase, and incrementally writes five stereo PCM16 WAVs.
- Added temporary job directories, five-file validation, immutable generation directories, IndexedDB-last Track switching, previous-generation deletion only after commit, new-Track rollback, cancellation cleanup, and abandoned-job cleanup. Track records remain non-green until the commit succeeds.
- Track Editor now exposes real model readiness/download state, actual phase/chunk progress, Split and Cancel actions, all five canonical status cards, the approved replacement warning, and the active-playback resource warning. Existing metadata/cifra drafts remain independently dirty after stem replacement; successful new-draft splits create the Track/original/stems transaction and reopen it saved.
- Desktop production evidence: downloaded and verified the 284,797,240-byte model; split an 8-second 44.1 kHz PCM fixture into five validated 48 kHz PCM16 WAVs; committed a new Track; observed all five cards and library badge green; and played the generated stems through the real Milestone 3 player with all five Track Controls enabled. Replacing a saved Track's generation passed. Cooperative cancellation displayed `Stem separation cancelled. No Track or stems were changed.` and retained the prior complete generation.
- Playback-isolation evidence: while a real 60-second Track was playing, completed a real WebGPU replacement split. AudioEngine ID `b97c8d9e-d14e-4bac-a07a-215005252f8d`, graph version `3`, session ID `a988570f-2a04-42c1-a894-a1b8a8038ae9`, active Track ID, blob source identity, and volume `1` remained unchanged; playback advanced from 0.976 s to 27.683 s and remained unpaused.
- Defects found and fixed: WAV frame count used the wrong chunk object's block alignment; generated 48 kHz validation incorrectly reused the 44.1 kHz input-rate gate; and a premature worker `complete` status caused an undefined IndexedDB lookup before new-Track commit. All failed runs remained temporary and did not commit stems.
- Automated tests: `npm test` — 26 passed, 0 failed. Added exact manifest/mapping tests, existing-Track commit identity test, failed new-Track rollback test, and worker WebGPU-only/AudioEngine-isolation source test. Existing Milestone 1–3 tests remain passing.
- Remaining before Milestone 4 completion: run a full split and collect time, peak memory, storage, thermal/UI responsiveness, and active-playback underrun evidence on Android tablet and iPad; run offline split after model caching on both; validate quota/corrupt-model/forced-record-failure paths in browser; and qualify compressed source decoding. The current production worker accepts mono/stereo PCM16 or Float32 WAV and reports unsupported containers explicitly.

### YYYY-MM-DD

- Change:
- Reason:
- Files affected:
- Tests updated:

### 2026-08-11

- Change: Implemented Milestone 3 desktop five-stem playback using a dedicated OPFS/PCM preparation worker, transferable 250 ms five-stem packets, a bounded 24-packet pool, and one AudioWorklet render cursor feeding five gain-controlled outputs. Added coordinated generation-based seeking, common pause/resume, original fallback, persistent Mute/Solo, and the right-side five-row Track Controls drawer.
- Synchronization evidence: deterministic aligned-impulse fixtures place all five impulses on the same source sample; live browser diagnostics reported identical consumed-frame counters for all five stems through playback, gain changes, pause/resume, seek, and setlist mutation. Atomic seek advanced generation 1→2 while session ID, source identity, and graph version remained unchanged. Normal desktop runs reported zero underruns.
- Failure evidence: a five-reference fixture with an incompatible Drums sample rate was rejected before stem output, persisted as invalid, played the retained original, and exposed disabled original-only stem controls. No partial four-stem graph played.
- Tests: `npm test` — 22 passed, 0 failed after Milestone 3 additions. Browser acceptance used the Codex in-app Chromium browser at `http://127.0.0.1:4173/?m3fixture=1`; console warnings/errors: 0. Existing setlist mutation during real stem playback preserved session/source/graph/generation, advanced playback, kept all frame counters equal, and reported zero underruns.
- Remaining validation: Android tablet Chrome installed-PWA and iPad Safari/Home Screen tests are not run. Long-track memory, GC, thermal behavior, output capture for click/discontinuity analysis, and real-device one-sample alignment evidence remain required before tablet sign-off or V1 completion.

### 2026-08-11

- Change: Implemented Milestone 1 foundation: vanilla PWA shell, manifest/service worker, IndexedDB/OPFS storage adapters, Track/Setlist models, stable-ID setlist operations, isolated original-audio import path, long-lived AudioEngine, Performance drawer, and Track Editor entry state.
- Reason: Approved Milestone 1 scope.
- Files affected: `index.html`, `manifest.webmanifest`, `sw.js`, `package.json`, `src/`, `test/`
- Tests updated: Added stable-ID setlist mutation/navigation tests; `npm test` passes 2/2. Browser smoke test verified shell load, drawer open/close, and Break insertion. Audio import and continuous-playback acceptance tests remain pending.

### 2026-08-11 — desktop acceptance instrumentation

- Change: Added deterministic WAV fixtures, fixture validation, AudioEngine identity/session/source/graph/transport metrics, and stable-ID end-of-track resolution using `lastKnownOrder`.
- Reason: Prepare and partially execute the approved Milestone 1 desktop playback acceptance work.
- Files affected: `src/audio.js`, `src/app.js`, `test/fixtures.mjs`, `test/fixtures.test.js`, generated `test/fixtures/*.wav`
- Tests updated: `node --check src/app.js`; `node --check src/audio.js`; `npm test` passes 4/4. Browser smoke run at `http://127.0.0.1:4175/` imported three fixture tracks, verified row insertion/removal and break insertion, and observed zero console logs/errors. Full active-playback acceptance is not passing yet because the browser session did not expose/retain active playback after import, so Milestone 1 is not functionally complete on desktop.
- Tests updated: `node --check src/app.js`; `node --check src/audio.js`; `npm test` passes 4/4. Browser run at `http://127.0.0.1:4176/` imported three 30-second fixtures, started real production playback with the exact row-level selector, verified a live session in the UI, drawer open/close, insertion below the active row, insertion below another row, non-current removal, break insertion/edit/removal, and active-row removal followed by next-track playback. Browser console had zero errors. Full invariant capture and reorder/Next/Previous assertions remain incomplete because the browser diagnostic hook was not readable from the browser evaluation surface.
- Remaining device validation: Android tablet and iPad install, offline, import, original playback, continuous mutation playback, and later V1-specific stem/WebGPU/chord validation remain pending.

### 2026-08-11 — startup shell fix

- Change: Mounted the default Performance route synchronously before storage hydration; added guarded storage capability checks and a visible in-memory fallback notification; made editor navigation explicit within the same shell.
- Reason: Prevent IndexedDB/OPFS startup failures from leaving only the application background visible.
- Files affected: `src/app.js`, `src/storage.js`, `src/app.css`
- Tests updated: Served verification passed at `http://127.0.0.1:4174/`: Performance header, central surface, drawer trigger, and transport visible; computed stage display/visibility/size valid; simulated `?simulateStorageFailure=1` retained the shell and showed the storage warning; Track Editor navigation stayed on the same URL; browser console had no logs/errors. `npm test` remains 2/2 passing.

### 2026-08-11 — Performance UI refinement

- Change: Refined the Set List drawer and transport presentation for tablet/live use without changing behavior or architecture. Added dark custom select styling, prototype-aligned row/action styling, larger touch targets, improved drawer hierarchy, centered transport controls, and a dominant gradient Play/Pause control.
- Reason: Bring the current Milestone 1 UI closer to the supplied Performance prototype before Milestone 2.
- Files affected: `src/app.css`, `src/refinement.css`, `index.html`, `progress.md`
- Tests updated: `npm test` passes 4/4. Browser verification at `http://127.0.0.1:4178/` confirmed five transport buttons, centered tablet-sized controls, dark custom setlist select (`appearance: none`, 46px height), drawer open/close, and real fixture playback advancing from `0:00 / 0:30` to `0:01 / 0:30` across drawer close with no console errors.

### 2026-08-11 — Save semantics and setlist duration fix

- Change: Fixed saved-setlist refresh after explicit Save and added real duration calculation from imported Track `durationSeconds` plus Break minutes. Duration recalculates from the working set and is displayed in the drawer without touching AudioEngine.
- Reason: Complete remaining Milestone 1 functional defects before further UI refinement or Milestone 2.
- Files affected: `src/app.js`, `src/setlist.js`, `test/setlist.test.js`, `progress.md`
- Tests updated: `npm test` passes 6/6, covering duration summing, order independence, and add/remove/edit recalculation. Browser verification at `http://127.0.0.1:4179/`: imported two 30-second fixtures, added a 15-minute break, observed `Total duration 16:00`, clicked SAVE, reloaded, and reopened the drawer with the same 2 songs, 3 items, break, order, and `16:00` duration. Browser console had zero errors.

### 2026-08-11 — New setlist naming modal

- Change: Added a LiveSet-styled naming modal to NEW. Confirming creates a new named working setlist; existing SAVE behavior remains unchanged and persists that name. Existing setlists continue to save directly without a naming prompt.
- Files affected: `src/app.js`, `src/refinement.css`, `progress.md`
- Tests updated: `npm test` passes 7/7. Browser verification at `http://127.0.0.1:4180/` opened the NEW modal, entered `Saturday Acoustic`, confirmed it, and verified the active Performance metadata changed to that name with no console errors.

### 2026-08-11 — Current set selector and break reorder

- Change: Synchronized the Open Set List control to the current working setlist, including newly created unsaved setlists, and marked break rows draggable so they use the existing stable-item reorder handlers.
- Files affected: `src/app.js`, `progress.md`
- Tests updated: `npm test` passes 7/7. Browser smoke verification was attempted at `http://127.0.0.1:4181/`; the browser tab closed during the modal interaction before the selector/break assertions completed, so those two UI assertions remain to be rerun in a stable browser session.

### 2026-08-11 — Single server, break actions, and logo

- Change: Consolidated development serving back to port 4173 and stopped the extra HTTP server processes. Added a `+` action after each break, preserved the `−` action, and made break insertion use stable setlist-item IDs. Replaced the text-only brand presentation with the project `logo.png` asset. Bumped the service-worker cache and added immediate activation/client claiming so the fixed shell assets update without accumulating servers.
- Files affected: `src/app.js`, `src/brand.css`, `src/refinement.css`, `index.html`, `sw.js`, `progress.md`
- Tests updated: `npm test` passes 7/7. Browser verification on the single server confirmed the logo asset is loaded from `/logo.png`; break action assertions require a fresh browser reload after the service-worker update.

### 2026-08-11 — Drawer freeze and logo size fix

- Change: Removed the self-triggering MutationObserver that repeatedly rewrote drawer option text and caused the browser to freeze when opening the drawer. Drawer decoration now runs once after click-driven renders. Increased the project logo presentation from 132px to 190px wide.
- Files affected: `src/app.js`, `src/brand.css`, `progress.md`
- Tests updated: `npm test` passes 7/7. The extra HTTP servers were stopped; the intended development server is port 4173 only. Browser re-verification requires reloading the 4173 tab to clear the prior service-worker/app cache before checking drawer interaction and break controls.

### 2026-08-11 — Drawer freeze verification

- Change: Removed the remaining global post-click drawer decoration hook and invalidated the service-worker shell cache. Added versioned entrypoint/service-worker URLs so an already-controlled browser can load the fixed shell.
- Verification: Fresh browser tab at `http://127.0.0.1:4173/index.html?fresh=4` rendered the app, opened the drawer successfully, reported no console logs/errors, and measured the logo at 190px wide using `/logo.png`.
- Tests: `npm test` — 7 passed, 0 failed. `http://127.0.0.1:4173/` — HTTP 200.

### 2026-08-11 — Persistence and drawer control follow-up

- Added a lazy OPFS capability fallback so IndexedDB setlist persistence is not discarded when OPFS is unavailable; audio import remains unavailable with a specific error in that case.
- Added one-shot drawer runtime decoration for the current setlist option, break drag handles, and break `+` controls. Increased logo presentation to 250px.
- Browser verification on `http://127.0.0.1:4173/index.html?fresh=6`: drawer rendered with the current setlist selected, break controls rendered after adding a break, logo measured at 250px, and no console errors.
- Tests: `npm test` — 7 passed, 0 failed.

### 2026-08-11 — Header logo sizing correction

- Corrected the logo background fit to crop the source image's large empty canvas instead of shrinking the complete bitmap into the header.
- Browser verification at a 384px-wide viewport: logo box 210×52px, drawer control approximately 46×46px, project `logo.png` visible at full header scale, and no console errors.
- Tests: `npm test` — 7 passed, 0 failed.

### 2026-08-11 — Repeated-action responsiveness fix

- Root cause: the drawer compatibility helper observed its own DOM writes, continuously scheduling more updates and starving subsequent UI input.
- Removed the self-observing `MutationObserver`; drawer decoration is now scheduled once per user action and writes only values that actually changed.
- Browser stress verification: eight immediate drawer open/close cycles followed by six New/Cancel cycles completed without click timeouts, stuck overlays, console errors, or delayed recovery. Break controls and current-set selection still rendered after the change.
- Tests: `npm test` — 7 passed, 0 failed.

### 2026-08-11 — Break controls after asynchronous rerenders

- Fixed break decoration timing so asynchronous Performance rerenders, including playback- and Save-driven renders, restore the drag handle and add action immediately.
- The render observer disconnects while applying its own idempotent changes, preventing the prior self-triggering responsiveness loop.
- Corrected break action order to `+` followed by `−`.
- Browser verification: controls and order remained unchanged across a Save rerender and five immediate drawer close/open cycles; no console errors. Tests: `npm test` — 7 passed, 0 failed.

### 2026-08-11 — Main Play starts selected setlist

- When no ActivePlaybackSession exists, the main Performance Play button now finds the first song item in the current working setlist, skipping leading breaks, and starts it through the production AudioEngine using its stable setlist-item ID.
- Once a session exists, the button retains the existing Play/Pause behavior.
- Browser verification with the real imported 30-second `track-a.wav` fixture: main Play changed the Performance title from `Performance` to `track-a`, playback advanced from 0:00 to 0:01, Pause held the displayed time constant, and Play resumed advancement. No console errors.
- Tests: `npm test` — 7 passed, 0 failed.

### 2026-08-11

- Change: Completed initial repository and handoff review; no implementation items marked complete.
- Reason: Establish the actual starting state before milestone planning.
- Files affected: `progress.md`
- Tests updated: None; no production test harness exists yet.
- Review notes: Repository contains only the handoff Markdown files, `preview.html`, `splitstem.html`, and `logo.png`; no production source tree, package manifest, build configuration, automated tests, PWA manifest, service worker, storage implementation, audio assets, or model assets exist.
- Review notes: The prototypes are static visual/interaction references with hard-coded data and demo behavior. `preview.html` navigates to `splitstem.html` as a separate document; production must use one long-lived shell. The performance prototype's placeholder controls/data must be replaced with real state, and production must expose five independent stems: Vocals, Guitar, Bass, Drums, Other.
- Open implementation risks: browser/build tooling within the approved lightweight vanilla-JS architecture, generated-stem codec/format based on Android+iPad testing, and real playback-rate/transposition DSP remain to be decided during implementation/testing and recorded here. No product behavior was changed during review.

### 2026-08-11 — Milestone 4 production stem format correction

- Replaced production PCM WAV stem persistence with native WebCodecs AAC-LC in M4A at 128 kbps per stem, 48 kHz stereo. Transactional generations now contain exactly `Vocals.m4a`, `Guitar.m4a`, `Bass.m4a`, `Drums.m4a`, and `Other.m4a`; no production WAV copies are committed.
- The retained original audio path and bytes are not changed by splitting or re-splitting. Separation now opens browser-supported input containers through a bounded decode window rather than requiring a WAV original.
- Added a local, pinned Mediabunny 1.53.0 runtime for M4A mux/demux, native WebCodecs encoding, validation, and bounded timestamp-range decoding. No CDN, cloud processing, WASM AAC encoder, CPU inference fallback, or independently clocked media elements were introduced.
- Updated the Milestone 3 preparation worker to decode final M4A assets outside the AudioWorklet and continue delivering one atomic five-stem transferable PCM packet. The AudioWorklet/shared-frame-cursor contract is unchanged.
- Desktop Chromium browser evidence: native AAC-LC capability passed; a real 48 kHz stereo M4A encoded and decoded; five M4A assets validated and produced one non-silent atomic five-stem playback packet. A bounded one-second-chunk encoding run measured **14,581,422 bytes total for five 180-second stems**. Expected nominal payload was 14,400,000 bytes; measured container/codec overhead was 181,422 bytes (1.26%). Expected totals are approximately 19.2 MB for four minutes and 24.0 MB for five minutes.
- Transaction safety remains: all five M4As are written under the split job's temporary directory, all are validated before Track commit, prior valid stems are deleted only after the Track record commits, and failed/cancelled jobs retain the original and previous generation.
- Automated result: `npm test` — **28 passed, 0 failed**. Browser format qualification: **PASS** for native AAC encode/decode, canonical five-file validation, bounded OPFS writes, and M4A-to-atomic-PCM preparation.
- Remaining target-device acceptance before claiming Milestone 4 complete on all required hardware: run a representative full model split, offline rerun, sustained synchronized playback, storage/memory/thermal/underrun measurements, and rollback fault injection on current Android tablet and the already-qualified current iPad/Home Screen PWA.

### 2026-08-11 — Milestone 4 Android WebGPU device-loss result

- Real Android Chrome validation failed during HT-Demucs inference output transfer with ONNX Runtime Web error `OrtRun()` code 1: WebGPU `BufferManager::Download` could not map the output buffer because the `GPUDevice` was lost.
- A focused GPU-pressure correction moved the `stems` output to `gpu-buffer`, explicitly downloaded and immediately released it after each run, disposed every input tensor, and released the redundant 285 MB JavaScript model buffer after session creation. Automated tests remained **28 passed, 0 failed**, and the same production worker continues to complete on Windows Chrome.
- Android Chrome produced the same `GPUBuffer mapAsync: [Device] is lost` failure after the correction. This is evidence that the qualified model/runtime exceeds the tested Android GPU/driver's practical inference capacity rather than a generic application, tunnel, checksum, or output-lifetime defect.
- Milestone 4 is therefore **not complete for the required Android tablet target**. Further work requires review of the model artifact/inference packaging or a separately qualified lower-peak-memory five-output WebGPU model; no CPU fallback, cloud processing, four-stem substitution, or silent architecture change was made.

### 2026-08-11 — Milestone 4 mobile qualification deferred

- Milestone 4 remains intact and partially implemented: local five-stem separation works on Windows Chromium/WebGPU; AAC-LC/M4A generation and transactional five-stem commit are implemented; generated stems integrate with the Milestone 3 synchronized player.
- Android local splitting is currently blocked by WebGPU device loss with the qualified HT-Demucs model. Full production splitting qualification on iPad remains unresolved. Mobile local splitting is deferred for later investigation, not deleted or classified as a failed feature.
- Downstream V1 work accepts original-only Tracks, already split Tracks, valid five-stem Tracks created on Windows, and future five-stem Tracks imported through `.liveset`. No downstream milestone depends on completing mobile local separation first. `SPLIT STEMS`, model readiness, Windows support, and all existing separation code remain enabled and unchanged.

### 2026-08-11 — `.liveset` setlist package milestone

- Added ZIP-compatible `.liveset` setlist export with root manifest v1, saved setlist order/breaks, exact Track metadata/cifra/settings, every referenced original, and complete five-stem generations when available. Export reads OPFS media incrementally into a single browser-downloadable archive and does not alter Tracks, setlists, or AudioEngine.
- Added untrusted-package validation for format/type/version, root/reference consistency, file count and archive/JSON size limits, unsafe absolute/backslash/empty/`.`/`..` paths, missing originals, and incomplete five-stem sets.
- Added dedicated-worker archive extraction, temporary OPFS staging, IndexedDB-last commit, cleanup/rollback paths, stable Track reference remapping, and confident deduplication when Track ID plus original filename/size match. Imported valid five-stem Tracks retain green/complete state and use the existing synchronized player.
- Performance drawer now exposes `EXPORT .LIVESET` and `IMPORT .LIVESET`. Export requires a saved reusable setlist and uses deterministic browser download; import preserves the existing unsaved-working-set confirmation before replacing the open working set.
- Automated result: `npm test` — **33 passed, 0 failed**. Coverage includes original-only and complete five-stem validation, traversal/version/incomplete-stem rejection, portable export contents, full round-trip reconstruction, exact cifra/settings/break preservation, and no-write Track deduplication.
- Browser evidence: a real saved `Friday Night` set containing an original Track and Break exported as a 14,883,693-byte `Friday Night.liveset`; the drawer reported `Exported Friday Night.liveset.`. A full clean-profile browser import and forced commit-failure browser run remain pending, so those acceptance items are not claimed.
