# LiveSet 1 — V1 Acceptance Tests

These scenarios are product acceptance criteria. A feature checkbox in `progress.md` should not be marked complete until its relevant tests pass.

## A. PWA and offline

### A1 Install/launch Android tablet

- Install PWA.
- Launch standalone.
- Confirm app shell renders correctly.

Expected: pass.

### A2 Install/launch iPad

- Add/install PWA using supported iPad flow.
- Launch standalone.

Expected: pass.

### A3 Offline reopen

- Prepare app/model/local media.
- Enable airplane mode.
- Kill/reopen PWA.

Expected:
- shell loads;
- saved setlists load;
- local tracks visible;
- existing songs play;
- chord diagrams render;
- splitter reports ready only if model is cached locally.

## B. Plain audio import

### B1 Add plain audio to empty set

- New setlist.
- Add Song.
- Select browser-decodable audio.

Expected:
- one internal Track created;
- red badge;
- song playable;
- no stem controls active.

### B2 Same track in multiple setlists

- Add same internal track to Set A and Set B.

Expected:
- one media copy;
- two references.

## C. Critical live request flow

### C1 Add Wonderwall while Creep plays

Setup:

```text
01 Wicked Game
02 Creep
03 Drive
```

Start `Creep` and allow it to play for at least 20 seconds.

While it plays:

1. open burger;
2. tap `+` on Creep row;
3. choose Wonderwall audio;
4. wait for import;
5. close drawer.

Expected:

```text
01 Wicked Game
02 Creep          (still playing)
03 Wonderwall
04 Drive
```

Audio assertions:

- Creep never receives a programmatic pause/stop;
- playback currentTime does not reset;
- volume does not drop due to player recreation;
- AudioEngine session ID remains same;
- after Creep ends/Next, Wonderwall is next.

### C2 Insert below a non-current row

While Creep plays, tap `+` on Drive and import Song X.

Expected: Song X appears below Drive, not below Creep. Creep continues.

### C3 Remove upcoming track

While Creep plays, remove Drive.

Expected: Creep continues. New Next reflects latest sequence.

### C4 Reorder upcoming tracks

While Creep plays, reorder rows repeatedly.

Expected: no stop/restart; latest ordering controls Next.

### C5 Remove active row

While Creep plays, remove Creep row.

Expected:
- Creep keeps playing;
- now-playing UI remains Creep;
- list no longer contains its row;
- when Creep finishes, next is resolved from updated working list.

### C6 Add/remove/reorder break during playback

Expected: zero playback interruption.

## D. Explicit setlist save semantics

### D1 Unsaved reorder

- Open saved Set A.
- Reorder.
- Do not Save.
- Choose Open Set B.

Expected: warning waits for Discard/Cancel.

### D2 Cancel discard

Choose Cancel.

Expected: remain on modified Set A working copy.

### D3 Discard

Choose Discard.

Expected: Set B opens. Persistent Set A remains original.

### D4 Save

Modify Set A and press Save.

Expected: reopen shows new ordering.

## E. Breaks

### E1 Insert break

Add 15-minute break and save.

Expected: persists.

### E2 Reorder break

Move break between other songs while audio plays.

Expected: audio unchanged.

### E3 Reach break

Finish/Next into Break.

Expected: app does not auto-play the post-break song.

## F. Track Editor without splitting

### F1 New file + cifra

- Open editor empty.
- Select new audio.
- Enter title/artist/genre.
- Paste cifra.
- Save Track without Split.

Expected:
- track persisted;
- red status;
- original plays;
- cifra renders.

### F2 Reopen existing track

Expected fields/source spacing preserved.

## G. Stem split

### G1 Five outputs

Run splitter on compatible device.

Expected exactly:

- Vocals
- Guitar
- Bass
- Drums
- Other

All pass validation.

### G2 Green status

Save complete stems.

Expected track badge green.

### G3 Playback uses stems only

Mute Vocals.

Expected vocal stem removed from mix; original is not simultaneously audible.

### G4 Persist mute

Mute Vocals, leave/reopen track.

Expected mute remains.

### G5 Missing stem fallback

Simulate/delete/corrupt one stem in test fixture.

Expected:
- status invalid/red;
- app plays original;
- does not play remaining 4 stems automatically.

### G6 Re-split warning

Split green track again.

Expected replacement warning.

### G7 Cancel replace

Expected old stems untouched.

### G8 Failed replace

Confirm replacement, force split failure.

Expected old valid stems remain.

## H. Cifra

### H1 Chords above lyrics

Paste normal cifra with chord lines.

Expected performance rendering keeps chord/lyric association.

### H2 Section labels

`[Intro]`, `[Verse]`, `[Chorus]` recognized/preserved.

### H3 Scroll speed persistence

Set auto-scroll speed, play/use it, leave track, reopen.

Expected last speed restored without Setlist Save.

### H4 Plain lyrics

No chord lines.

Expected lyrics still render; no crash.

## I. Chord diagrams

### I1 Common chords offline

Airplane mode. Load track containing:

`C Cm C7 Cmaj7 C#m F# Bb Am7 G/B Cadd9 Dsus4`

Expected recognized chord diagrams available for supported dataset forms.

### I2 Unknown symbol

Include exotic/unresolved symbol.

Expected cifra text remains; no renderer exception.

## J. `.liveset` packages

### J1 Export complete setlist

Export saved set with mix of red and green tracks.

Expected single `.liveset` file.

### J2 Import on clean install/profile

Expected:
- setlist recreated;
- tracks recreated;
- original-only tracks red/play;
- stem tracks green/play with settings/cifra.

### J3 Package corruption

Remove required file from archive fixture.

Expected import rejected safely, no half-imported permanent state.

### J4 Path traversal security

Malicious archive paths.

Expected rejected/sanitized; cannot escape import temp root.

## K. Stress/performance

### K1 Long setlist

At least 100 song/break items.

Expected drawer usable; editing does not rebuild audio engine.

### K2 Large import during playback

Import large song while another plays.

Expected current audio remains active; UI remains reasonably responsive.

### K3 Repeated mutations

During one song perform 50 list mutations.

Expected no orphaned audio contexts/nodes, no restart.

### K4 Storage failure

Simulate quota failure during split/import.

Expected clear error; existing track data safe; temp cleaned where possible.

## L. Required platform sign-off

Do not call V1 complete until the critical tests above have actual pass evidence on:

- at least one target Android tablet;
- at least one target iPad.

Record device model, OS version, browser/PWA version and result in `progress.md`.

