# LiveSet 1 — Product Definition

## 1. Product summary

LiveSet 1 is an offline-first performance application for solo musicians and small live performers who use backing tracks at bars, restaurants, private events, hotels, street performances and similar gigs.

The app combines four things that are normally fragmented across multiple tools:

1. a performance-safe backing-track player;
2. reusable setlists that can be modified on the fly during a gig;
3. a local track editor with cifra/lyrics and performance settings;
4. local five-stem separation so a musician can remove or isolate parts such as vocals or guitar.

The stem splitter is useful, but it is not the center of the product. The center of the product is the **gig performance workflow**: prepare songs, build a set, perform, react to requests, keep the music going, and reuse the set later.

## 2. V1 product goal

V1 must allow a musician to:

- install/run LiveSet 1 as a PWA;
- work without internet once required app/model assets are installed/cached;
- import ordinary audio from device storage using the browser/system file picker;
- use that ordinary audio directly in a setlist even if it has never been stem-split;
- optionally open a track in the Track Editor, edit song metadata and paste a cifra;
- optionally generate five local stems with WebGPU;
- save the track into the LiveSet local library;
- add that saved track to one or more setlists;
- build reusable setlists with songs and timed breaks;
- explicitly save a reusable setlist;
- make temporary changes to the working set during a gig without changing the saved set unless `SAVE` is pressed;
- add a requested song during playback without interrupting the current song;
- remove or reorder setlist items during playback without interrupting the current song;
- play either a complete five-stem track or a plain original audio track;
- mute/solo individual stems where available;
- display the cifra with chords above lyric lines;
- auto-scroll the cifra at a per-track speed and remember the last speed used;
- show offline chord diagrams automatically for recognized chords;
- export a complete setlist and required media as a `.liveset` package and import it on another device.

## 3. Primary user

The primary V1 user is a musician performing live from a tablet.

Typical context:

- device mounted on a stand;
- audio output routed to a mixer/PA/interface;
- performer is singing or playing an instrument while operating LiveSet;
- little time is available for menus;
- venue internet may be poor or absent;
- requests can arrive while a song is already playing;
- any playback interruption caused by UI editing is unacceptable.

The UI must therefore prioritize:

- large hit targets;
- immediate state visibility;
- minimal confirmation steps during performance;
- no unnecessary modal flows;
- robust offline operation;
- clear distinction between temporary working-set changes and persistent saved-set changes.

## 4. Platform priority

V1 platform priority is:

1. Android tablets — required.
2. iPads — required.
3. Windows browsers/PWA — supported after the two tablet targets.
4. Android and iOS phones — lower priority; UI should remain usable but tablet layouts are primary.

The architecture must not depend on APIs available only on Android/Chromium if doing so breaks the required iPad target.

## 5. Product terminology

### 5.1 Track

A `Track` is a LiveSet song record.

A track can be one of two playback states:

- **Original-only track**: has a source audio file but does not have a complete valid five-stem set.
- **Stem-enabled track**: has a source audio file plus all five valid generated/imported stems.

A track can still have LiveSet metadata and cifra without stems.

### 5.2 Original audio

The audio file the user initially imported, for example MP3, M4A, WAV, FLAC, AAC or another format the current browser/device can decode.

LiveSet does not promise support for every theoretical extension. V1 accepts what the runtime can actually decode.

### 5.3 Canonical stems

Every complete split track uses exactly these five independent stems:

- Vocals
- Guitar
- Bass
- Drums
- Other

Do not merge `Drums` and `Other` in the implementation. The performance prototype currently contains a four-row placeholder in one control panel. That is a prototype inconsistency. The canonical production model is five stems everywhere.

### 5.4 Cifra

The user-pasted song chart/lyrics used on the performance screen.

The expected source style is normal cifra text with chords on a line above the lyric line, for example:

```text
[Verse]
Am        F             C
Some lyric text appears here
G                     Am
Another lyric line appears here
```

The app should not require the user to rewrite the cifra into `[Am]word` notation.

### 5.5 Setlist

A reusable ordered list containing:

- track references;
- custom break items with a duration in minutes.

A setlist does not duplicate track audio or stems.

### 5.6 Working setlist

The mutable in-memory copy currently being used during a performance session.

Changes to the working setlist are not persistent until the user presses `SAVE`.

### 5.7 Saved setlist

The persistent reusable setlist stored by LiveSet.

### 5.8 Break

A timed non-song setlist item used to represent an intermission.

Example: 15-minute break after approximately 45 minutes of songs.

### 5.9 `.liveset` package

A portable LiveSet archive used for moving tracks or complete setlists between devices.

A `.liveset` file must contain an internal manifest that identifies its package type and version. Details are defined in `architecture.md`.

## 6. Main user journeys

### 6.1 Play a plain audio file tonight

1. User opens a reusable setlist in Performance.
2. User taps `+` on a specific song row or taps `ADD SONG`.
3. System file picker opens.
4. User chooses an audio file from device storage.
5. LiveSet imports a single copy into its internal local library.
6. LiveSet creates a track record.
7. The track is marked with the red/no-stems status.
8. The track is inserted into the working setlist at the requested location.
9. The currently playing song continues uninterrupted.
10. If the user does not press `SAVE`, this addition affects only the current working set.

### 6.2 Handle a live request while music is playing

Scenario:

- `Creep` is currently playing.
- Someone asks: "Play Wonderwall."

Flow:

1. Musician opens the burger/setlist drawer.
2. `Creep` continues playing.
3. Musician taps `+` on the row after which Wonderwall should be inserted. In the common case this is the current row.
4. System file picker opens.
5. Musician selects `Wonderwall` from device storage, or a previously exported `.liveset` track package.
6. Import occurs without touching the active playback session.
7. Wonderwall is inserted immediately **below the row whose `+` was tapped**.
8. Current playback position in Creep is unchanged.
9. Closing the drawer is purely UI behavior; it does not restart/reseek playback.
10. When Creep finishes or the user presses Next, the next track is resolved from the updated working setlist.
11. If the musician wants this modified ordering next time, they explicitly press `SAVE`.

### 6.3 Add a track at the end of a set

1. User taps `ADD SONG` at the bottom of the drawer.
2. Chooses an audio file/package.
3. LiveSet imports/reuses it.
4. Appends it at the end of the working setlist.
5. Playback continues if another song is active.

### 6.4 Prepare a backing track before a gig

1. User opens Track Editor / Stem Splitter.
2. View opens empty.
3. User chooses either:
   - an existing LiveSet track; or
   - a new audio file from device storage.
4. Metadata fields populate or are editable:
   - song name;
   - artist;
   - genre.
5. User pastes/edits cifra.
6. User can press `SAVE TRACK` without splitting. This creates/updates a valid original-only LiveSet track.
7. Or user presses `SPLIT STEMS`.
8. WebGPU local inference generates Vocals/Guitar/Bass/Drums/Other.
9. All five outputs are validated.
10. On successful save, original audio is retained but normal playback now uses the stems.
11. The user can press `ADD TO SET LIST` and choose one or multiple existing setlists.

### 6.5 Re-split an existing track

1. Track Editor opens empty.
2. User selects an existing track.
3. Existing details, cifra and stem status are loaded.
4. User requests splitting again.
5. App warns that existing generated stems will be replaced.
6. User confirms or cancels.
7. Original source remains untouched.
8. New stems are generated into temporary storage.
9. Only after all five outputs pass validation are old stems atomically replaced.
10. On failure, old valid stems remain available.

### 6.6 Create and save a reusable setlist

1. User taps `NEW`.
2. If current working set contains unsaved changes, app asks whether to discard them.
3. User creates/renames the new setlist.
4. Adds songs and breaks.
5. Reorders by drag-and-drop/touch drag.
6. Presses `SAVE`.
7. Persistent setlist is updated.

### 6.7 Make one-night changes

1. User opens a previously saved setlist.
2. User reorders songs, inserts requests, removes songs or adjusts a break.
3. These changes apply immediately to the working set and upcoming playback order.
4. Saved reusable setlist remains unchanged.
5. User leaves without pressing `SAVE`.
6. When opening another setlist/new set, LiveSet warns that unsaved changes will be discarded and waits for a user decision.

No crash-recovery/autosave of the temporary working set is required in V1.

### 6.8 Export a complete gig

1. User chooses Export for a saved setlist.
2. LiveSet collects:
   - setlist definition;
   - every referenced track's metadata;
   - original audio for every referenced track;
   - complete stem files where available;
   - cifras and track settings;
   - package manifest/version.
3. App produces a single `.liveset` file via a browser-supported download/share/save flow.
4. User can move that file using USB, Files, cloud storage, email or other OS-level methods.
5. Another LiveSet installation can import it and recreate the set without duplicating identical tracks unnecessarily.

## 7. Track status badge semantics

The Performance drawer shows a status dot/badge for each song.

### Green

Green means:

- all five canonical stems exist;
- all are readable;
- all are valid enough to load for synchronized playback;
- LiveSet will use stems as the audio source for this track.

### Red

Red means one of the following:

- no stems have been generated;
- stem package is incomplete;
- one or more stem files are missing/corrupt/unreadable;
- validation failed.

In all red cases, LiveSet plays the retained original audio if it is valid.

Red is not an error that blocks the song. It means "original-only playback".

## 8. Playback source selection

Playback rule:

1. If a complete valid five-stem set exists, use stems.
2. Do not simultaneously play the original audio.
3. If the stem set is incomplete or invalid, use original audio only.
4. Do not play a partial subset of stems as an automatic fallback.

Reason: partial backing tracks are dangerous in live performance and can silently remove instruments.

## 9. Track settings

At minimum a track stores:

- track ID;
- title/song name;
- artist;
- genre;
- original source filename;
- original audio asset reference;
- stem asset references/status;
- cifra source text;
- parsed cifra/chord cache if used by implementation;
- stem mute states;
- stem solo states if supported by the prototype controls;
- cifra auto-scroll speed;
- other prototype track controls retained in V1, such as playback speed/transpose, if implemented;
- created/updated timestamps;
- schema version.

The specifically user-approved persistent performance settings are:

- stem mute state;
- cifra scroll speed, always saving the last speed used.

## 10. Cifra behavior

### 10.1 Source text

The original user-pasted text must be retained so opening Track Editor does not destroy spacing or formatting.

### 10.2 Parsing

LiveSet should parse the text into display structures for performance, but parsing must not rewrite the source unnecessarily.

Recognition should support common chord symbols including examples such as:

- C
- Cm
- C7
- Cmaj7
- C#m
- F#
- Bb
- Am7
- G/B
- Cadd9
- Dsus4

The chord detection logic must be tolerant enough for normal pasted cifras and must not require special markup.

### 10.3 Display

Chords remain visually above their associated lyric line.

Spacing should preserve the intent of the pasted cifra as much as practical across responsive tablet widths.

### 10.4 Scroll

- Performance screen provides manual scroll and auto-scroll controls.
- Auto-scroll speed is track-specific.
- Any change to the auto-scroll speed becomes the track's new saved speed immediately.
- This persistence is independent of setlist Save; it is a track preference, not a working-set modification.

## 11. Chord diagrams

Chord diagrams are required in V1.

Requirements:

- fully offline once the PWA is installed/cached;
- no remote API at performance time;
- no manual chord fingering entry required from the user;
- derived automatically from chord symbols recognized in the cifra;
- handle common open chords, minor/major/7/maj7/sus/add/slash/barre forms expected in normal gig material;
- graceful handling of an unrecognized chord: display the chord text, do not break the performance view;
- implementation may use a bundled local chord fingering dataset and local renderer;
- chord implementation is deliberately last in the V1 development sequence so it does not block core playback.

## 12. Setlist semantics

### 12.1 Ordering

Setlist is an ordered sequence of typed items:

- track item;
- break item.

### 12.2 `+` button on a song row

The `+` attached to a specific row means:

> Import/select a song and insert it immediately after this row.

It does not mean "add after the currently playing song" unless the tapped row happens to be the current song.

### 12.3 `ADD SONG` button

Bottom `ADD SONG` imports/selects a song and appends it at the end of the current working setlist.

### 12.4 Minus/remove

Remove the selected setlist item from the working list.

If the removed item is not playing, removal is immediate.

If the removed row is the currently playing track:

- audio must continue to the end or until the user explicitly controls transport;
- removing the row must not stop the sound;
- the active playback session keeps a stable track/session identity independent of the mutable list;
- after the active song ends, Next is resolved using the latest working setlist state.

### 12.5 Reorder

Reorder changes upcoming sequence immediately but never touches the active audio session.

### 12.6 Save

`SAVE` commits the working list to persistent reusable setlist state.

No implicit setlist autosave.

## 13. Break behavior

A break item contains at least:

- break ID;
- label (default `Break`);
- duration in minutes;
- position in the setlist.

V1 UI allows adding, removing, reordering and editing the duration.

A break is not an audio track.

When sequence reaches a break, playback must not automatically start the next song as though the break did not exist. The UI should clearly present the break and its duration. Continuing after the break is musician-controlled.

## 14. Performance safety requirements

These are hard requirements.

### PS-01 Continuous playback during list editing

While a track is playing, the following must not pause, stop, recreate, seek, restart, change volume, or otherwise disrupt active audio:

- opening/closing setlist drawer;
- scrolling drawer;
- opening the OS file picker;
- importing a new song;
- inserting a song;
- removing a non-playing song;
- removing the currently playing row;
- reordering songs;
- adding/removing/reordering breaks;
- editing break duration;
- updating setlist summary UI;
- changing unsaved working-list state.

### PS-02 Stable playback identity

The active track cannot be represented only by its setlist array index.

Insertion/removal above the current row must not change which asset is playing.

### PS-03 Audio engine isolation

Setlist state mutations and view rendering must not recreate the active AudioContext/audio graph.

### PS-04 File import isolation

File-reading/import/storage work must not replace the active media source or block the UI thread enough to cause avoidable playback glitches.

Heavy work should be moved off the main thread where browser APIs permit.

### PS-05 Stem processing isolation

Stem separation is a preparation feature, not something to run casually during an active gig song. If the user starts heavy separation while another song is playing, the implementation should warn about device load or otherwise avoid endangering playback. Do not silently sacrifice playback quality for model inference.

## 15. Offline requirements

Once installed and initialized:

- shell UI must open offline;
- local library must be readable offline;
- saved setlists must open offline;
- audio playback must work offline;
- stem playback must work offline;
- cifra must work offline;
- chord diagrams must work offline;
- stem model/runtime assets required for local splitting must be locally cached/available before offering offline splitting as ready.

No core V1 feature should require login or network round-trips.

## 16. Out of scope / non-goals for V1

Unless required elsewhere in the docs, do not add:

- cloud synchronization;
- multi-user collaboration;
- account/login system;
- server-side media processing;
- streaming-service integration;
- automatic publishing;
- online chord lookup at performance time;
- a full DAW;
- arbitrary multitrack recording;
- complex audio mastering;
- a remote database;
- automatic temporary-set crash recovery.

## 17. Product completion definition

V1 is complete only when:

- both required prototypes have equivalent production functionality;
- core use cases work offline;
- Android tablet and iPad acceptance tests pass;
- setlist edits during playback do not interrupt audio;
- plain original-only tracks work;
- complete five-stem tracks work;
- incomplete stems safely fall back to original;
- Track Editor can save metadata/cifra without splitting;
- local splitting works with the chosen five-stem ONNX/WebGPU model on supported hardware;
- explicit setlist save semantics work;
- `.liveset` export/import works;
- chord diagrams work offline;
- no placeholder/fake processing remains in required paths.

