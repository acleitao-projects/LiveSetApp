# LiveSet 1 — Detailed Feature Specification

This document converts the prototypes and approved product behavior into implementation-level feature requirements.

## 1. Visual design baseline

The supplied HTML prototypes define the V1 visual language.

Preserve:

- near-black background;
- dark translucent panels;
- blue/violet/pink gradient accents;
- rounded cards/drawers;
- typography hierarchy;
- large central performance/cifra surface;
- chord rails on left/right;
- persistent bottom transport bar;
- slide-in setlist and track-control drawers;
- Track Editor two-column desktop/tablet layout that becomes one column on narrower widths.

Do not replace the UI with generic browser controls or a new design system.

Prototype placeholder text/data must be replaced with real state.

## 2. Application shell

### F-APP-001 Single runtime shell

**Requirement:** Performance and Track Editor exist in one PWA runtime.

**Acceptance:** switching views does not require a full browser document navigation.

### F-APP-002 Installable PWA

Include manifest, icons, service worker and installability requirements.

### F-APP-003 Offline launch

After initial preparation, reopening the installed PWA without network loads the shell and local data.

### F-APP-004 Tablet-first responsive layout

Primary tuning:

- landscape Android tablet;
- landscape/portrait iPad where practical.

Controls must remain touchable.

## 3. Performance screen — header

The header contains:

- burger button to open Set List drawer;
- LiveSet 1 branding;
- current setlist name/metadata where space permits;
- now-playing title/artist;
- right-side control/drawer trigger if retained by final prototype behavior.

Mobile/narrow layouts may hide secondary labels but not primary transport/navigation.

## 4. Performance screen — cifra/lyrics area

### F-CIFRA-001 Track title and artist

Display active track metadata.

### F-CIFRA-002 Parsed cifra

Render section labels, chord lines and lyrics from saved track source.

### F-CIFRA-003 Chords above lyrics

Do not inline chord names into lyric words unless parsing fallback requires it.

### F-CIFRA-004 Manual scroll

Finger/mouse wheel/manual drag scroll works at all times.

### F-CIFRA-005 Auto-scroll

Provide controls matching prototype intent:

- start/stop auto scroll;
- adjustable speed;
- speed readout.

### F-CIFRA-006 Persist last scroll speed

When user changes speed, persist to track immediately.

Opening that track later starts with the last used speed.

This does not require pressing Setlist Save.

### F-CIFRA-007 No cifra

If track has no cifra, player remains fully usable and the center area shows a quiet empty-state rather than an error.

## 5. Chord diagram rails

### F-CHORD-001 Unique chord extraction

Extract unique recognized chords from the active track cifra.

### F-CHORD-002 Offline diagrams

Resolve and render locally.

### F-CHORD-003 Current chord highlighting

Where the current scroll position/chord context can be determined, visually highlight the current/near-current chord as in prototype.

If synchronization to lyrics is not exact, do not invent beat tracking. Highlighting may follow visible/nearest row.

### F-CHORD-004 Overflow

Chord rails scroll independently if unique chords exceed available height.

### F-CHORD-005 Unknown chords

Unknown chord does not crash the song. Cifra text still renders.

## 6. Bottom transport

### F-PLAYER-001 Persistent player

Visible on Performance screen.

### F-PLAYER-002 Progress

Show elapsed/duration and seek bar.

### F-PLAYER-003 Play/pause

Single large center control.

### F-PLAYER-004 Rewind/forward

Seek by defined interval.

### F-PLAYER-005 Previous/next song

Navigate based on the current **working** setlist.

### F-PLAYER-006 Next track label

Show next playable track or Break state based on current working list.

### F-PLAYER-007 Cog / Track Editor

Opens Track Editor view empty.

It does not automatically edit the current song.

### F-PLAYER-008 Keyboard shortcut

Desktop may support Space for play/pause as prototype suggests, but touch behavior is primary.

## 7. Audio source behavior

### F-AUDIO-001 Plain track

If no complete valid stems exist, play original.

### F-AUDIO-002 Complete stem track

If all five exist and validate, play five synchronized stems.

### F-AUDIO-003 Original retained

Original remains stored after split.

### F-AUDIO-004 Original not mixed with stems

Never double the track by playing original plus stem mix.

### F-AUDIO-005 Incomplete stem fallback

Missing any one stem => red status and original playback.

### F-AUDIO-006 No partial automatic mix

Do not silently play 4/5 stems.

## 8. Set List drawer

### 8.1 Drawer behavior

Opening/closing drawer overlays Performance view.

**Critical:** opening/closing does not affect audio.

### 8.2 Toolbar

Contains:

- `+ NEW`
- `OPEN SET LIST…`
- `SAVE`

### F-SET-001 New

If working set dirty, warn and wait:

- Discard changes
- Cancel

If clean, proceed immediately.

### F-SET-002 Open

List saved setlists.

If dirty, same warning before replacement.

### F-SET-003 Save

Persist current working set.

Do not autosave setlist mutations.

### F-SET-004 Set summary

Show song count and approximate song duration total. Break time may be shown separately or included if clearly labeled.

### F-SET-005 Home

Prototype contains Home/back-to-set-selection. V1 may use this to present a simple set-selection landing state in the same shell. Navigation must honor unsaved-change warnings.

## 9. Setlist song row

Each row contains:

- drag handle;
- current ordinal among songs;
- stem badge;
- song title;
- artist;
- Play Now;
- `+`;
- `−`.

### F-ROW-001 Green/red badge

Green = complete valid five stems.

Red = original-only/fallback.

### F-ROW-002 Active row

Highlight row associated with active playback when it still exists in list.

If playing row was removed, keep now-playing header/player accurate even if no list row is highlighted.

### F-ROW-003 Play Now

Starts the chosen song intentionally.

Because this is an explicit transport command, it may replace current playback.

This is distinct from setlist editing actions, which must not replace playback.

### F-ROW-004 Plus insertion

Tap plus on row X:

1. open file picker or track-selection/import flow;
2. user chooses track;
3. insert immediately after row X;
4. do not stop current playback.

### F-ROW-005 Minus removal

Remove row from working set.

If row is active, audio still continues.

### F-ROW-006 Reorder

Touch/mouse drag.

Change working sequence instantly.

No audio interruption.

## 10. Bottom Add Song

### F-SET-ADD-001 Append

`+ ADD SONG` opens file/import picker and appends at end.

### F-SET-ADD-002 Import plain audio

Plain browser-decodable audio becomes a red-status track and is playable.

### F-SET-ADD-003 Import package

Accept `.liveset` track package as applicable.

### F-SET-ADD-004 Reuse

If imported content already exists in LiveSet, reuse the internal track rather than copy per setlist.

## 11. Breaks

### F-BREAK-001 Add

`ADD BREAK` inserts a Break item. Default duration 15 minutes unless UI/user changes it.

### F-BREAK-002 Duration

Editable numeric duration, sensible min/max like prototype (1–120 minutes).

### F-BREAK-003 Reorder

Same drag concept as songs.

### F-BREAK-004 Remove

Minus removes from working list.

### F-BREAK-005 Playback sequence

If next item is Break, do not auto-start the song after it.

Display clear break state and let musician resume/advance manually.

## 12. Track Controls drawer

Production must show five independent stems, correcting the prototype's combined Drums/Other placeholder.

Rows:

- Vocals
- Guitar
- Bass
- Drums
- Other

### F-CTRL-001 Mute

Available only in StemSourceMode. Persist track mute state.

### F-CTRL-002 Solo

If retained from prototype, available in StemSourceMode.

### F-CTRL-003 Original-only state

When red/original-only track is active, stem controls are disabled with clear message such as `Stems not available for this track`.

### F-CTRL-004 Playback speed

Prototype includes 80–120%. Implement only with real audio behavior; do not make a cosmetic slider.

### F-CTRL-005 Tone/transpose

Prototype includes -6 to +6 semitones. Implement only if real-time pitch shifting/transposition can be done acceptably without changing tempo unexpectedly. If not ready, mark as incomplete in Progress rather than pretending.

### F-CTRL-006 Reset

Restore track controls to defined defaults.

Do not reset cifra content or delete stems.

## 13. Track Editor / Stem Splitter — entry

### F-EDIT-001 Empty initial state

Opening from cog displays empty/unselected editor.

### F-EDIT-002 Select source

Allow:

- select existing LiveSet track;
- browse device for new audio.

Prototype's `Choose Song` file-picker pattern is a visual reference.

## 14. Track Editor — source card

Display:

- filename;
- size;
- readiness/decode state;
- simple waveform thumbnail may remain decorative unless real generation is implemented.

Do not claim `ready to split` until decode/model prerequisites are valid.

## 15. Track Editor — metadata

Editable:

- Song name
- Artist
- Genre

Auto-prefill song name from filename for new imports, stripping extension, but user can edit.

Do not invent artist/genre from filename unless obvious parsing is explicitly implemented.

## 16. Track Editor — cifra

### F-EDIT-CIFRA-001 Textarea

Use prototype styling: blends into dark panel, monospace, no white input box.

### F-EDIT-CIFRA-002 Paste normal cifra

Support raw pasted chord-over-lyrics format.

### F-EDIT-CIFRA-003 Save without split

Cifra can be added to a normal track and saved even if stems are never created.

### F-EDIT-CIFRA-004 Preserve source

Round-trip through editor without destroying line breaks/spaces.

## 17. Track Editor — five-stem selector

Always show exactly:

- Vocals
- Guitar
- Bass
- Drums
- Other

The product's complete split format is five stems. If the model technically generates all five as one operation, switches may be visual/selection controls only if selective generation is truly supported. Do not generate an invalid "complete" track with only some stems and mark it green.

Recommended V1 behavior: split operation produces all five required outputs.

## 18. Split operation

### F-SPLIT-001 WebGPU

Use ONNX Runtime Web WebGPU path.

### F-SPLIT-002 Real progress

Replace prototype fake timer.

### F-SPLIT-003 Phases

Display meaningful state:

- preparing audio;
- loading model;
- separating;
- encoding/writing;
- validating;
- complete/failed.

### F-SPLIT-004 Replace warning

If selected track already has valid stems and Split is requested:

> Existing stems will be replaced. The original audio will be kept.

Buttons:

- Replace stems
- Cancel

Wait for user choice.

### F-SPLIT-005 Transactional safety

Failure cannot destroy old valid stems.

### F-SPLIT-006 Original preserved

Always retain source.

## 19. Save Track

### F-TRACK-SAVE-001 New plain track

Imports source and saves metadata/cifra with no stems.

### F-TRACK-SAVE-002 New split track

Saves original + five stems + metadata/cifra/settings.

### F-TRACK-SAVE-003 Existing track

Updates metadata/cifra/settings.

### F-TRACK-SAVE-004 Validation

Cannot save a record whose original audio asset write failed.

### F-TRACK-SAVE-005 User feedback

Show success/error without unnecessary redirect.

## 20. Add To Set List from Track Editor

### F-TRACK-SET-001 Existing setlists

Open selector listing saved setlists.

### F-TRACK-SET-002 Multiple selection

Allow adding the just-saved/current track to one or multiple existing setlists.

### F-TRACK-SET-003 Persistence

This operation intentionally changes those saved setlists, because user explicitly selected `ADD TO SET LIST` from preparation/editor flow.

If product implementation instead loads them as working sessions, ensure user intent is explicit. The simplest interpretation for V1 is direct persistent add from the editor.

### F-TRACK-SET-004 No duplicate instance guard

A setlist may technically include the same song more than once. Do not globally forbid duplicates unless the user chooses to avoid them.

## 21. Import/export packages

### F-PACK-001 Export complete setlist

Create `.liveset` archive with all required track assets.

### F-PACK-002 Import complete setlist

Reconstruct tracks and setlist locally.

### F-PACK-003 Track package

Support standalone track package if implemented by export UI; package manifest differentiates type.

### F-PACK-004 Deduplicate

Do not store duplicate media if an identical local track is confidently recognized.

### F-PACK-005 Portability

Package cannot contain OPFS-internal handles. It must contain actual portable files + JSON manifests.

## 22. Unsaved setlist dialogs

Trigger before:

- New setlist;
- Open another setlist;
- navigation that intentionally replaces the current working set where applicable.

Dialog:

```text
You have unsaved changes to this set list.
Opening another set list will discard them.

[Cancel] [Discard changes]
```

Do not offer implicit Save unless added deliberately; existing Save button is clear.

## 23. Continuous playback feature requirements

This section overrides convenience implementations.

### F-PERF-001 Drawer

Open/close while song plays: zero stop/restart.

### F-PERF-002 Insert

Add requested track after any row while song plays: active source remains identical.

### F-PERF-003 Remove upcoming

No interruption.

### F-PERF-004 Remove active row

Audio remains audible and progresses normally.

### F-PERF-005 Reorder

No interruption.

### F-PERF-006 Break edits

No interruption.

### F-PERF-007 File picker

Opening system picker must not intentionally pause LiveSet. Some OS/browser behavior may transiently affect focus; app code must not call pause/stop on picker events.

### F-PERF-008 Import storage

Copying file into OPFS must not replace active player nodes.

### F-PERF-009 Rerender

DOM rerender must not recreate player/audio service.

## 24. Status and notifications

Use concise, stage-friendly feedback.

Examples:

- `Track added below Creep`
- `Set list saved`
- `Stems ready`
- `Using original audio — stems incomplete`
- `Not enough storage to split this track`

Avoid large blocking dialogs except for destructive/required choices.

## 25. Accessibility / touch

- Buttons need labels/ARIA where icons only.
- Touch targets approximately 44px minimum where practical.
- Do not require hover.
- Drag handles must have a non-drag fallback for accessibility if feasible, such as move up/down actions in context menu.
- Maintain contrast in dark UI.

## 26. Feature implementation order

Recommended sequence for lower-cost Codex models:

1. App shell + modules + PWA scaffolding.
2. IndexedDB + OPFS repositories.
3. Plain audio import/library record.
4. Setlist saved/working state model.
5. Performance screen bound to real data.
6. Original-audio transport.
7. Continuous-playback-safe add/remove/reorder/break editing.
8. Track Editor metadata/cifra save without stems.
9. Five-stem playback graph and controls using fixture stems.
10. ONNX Runtime Web/WebGPU split pipeline.
11. Complete/invalid stem validation + fallback.
12. `.liveset` export/import.
13. PWA offline hardening and iPad/Android validation.
14. Cifra parser/rendering hardening.
15. Offline chord recognition/fingering/diagrams — mandatory final V1 feature.
16. Full acceptance test pass and cleanup.

Do not start by building chord diagrams or visual polish while the continuous playback model is unproven.

