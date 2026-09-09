# LiveSet 1 — Codex Handoff Pack

This folder is the authoritative implementation handoff for LiveSet 1 V1.

## Run the current V1 build

From this directory, keep one fixed local server running:

```powershell
python -m http.server 4173 --bind 0.0.0.0
```

Open `http://127.0.0.1:4173/` on the development computer. Tablet testing requires HTTPS, normally through a temporary tunnel to this same fixed port. Run the automated suite with `npm test`.

The V1 feature implementation is present through offline cifra/chord diagrams and `.liveset` packages. Physical Android/iPad acceptance remains a separate release sign-off. Mobile local WebGPU separation is explicitly deferred; the existing Windows WebGPU splitter remains intact.

## Read order

1. `product.md` — product definition, users, workflows, terminology, scope, hard rules.
2. `architecture.md` — required PWA architecture, storage, audio engine, stem splitting, data contracts, import/export, offline behavior, compatibility rules.
3. `features.md` — screen-by-screen and feature-by-feature implementation requirements and acceptance criteria.
4. `acceptance_tests.md` — end-to-end scenarios that must pass before V1 is considered complete.
5. `progress.md` — implementation checklist and progress log. Keep this file updated while coding.
6. The supplied prototypes:
   - performance prototype (`preview.html`)
   - track editor / stem splitter prototype (`splitstem.html`)

## Authority and conflict rules

Use this precedence when requirements appear to conflict:

1. Explicit statements in these Markdown documents.
2. User-approved product decisions represented in these documents.
3. Visual layout and styling of the HTML prototypes.
4. Prototype placeholder data or prototype-only JavaScript.

The prototypes are visual/interaction references. Their mock data, hard-coded lyrics, hard-coded chords, fake progress animation, and prototype navigation are **not** implementation architecture.

Do not reinterpret requirements in order to make implementation easier. If something is genuinely impossible on a required platform, document the limitation in `progress.md` and implement the closest behavior that preserves the product intent. Do not silently redesign.

## Core V1 principles

- PWA first.
- Local-first and offline-first.
- Android tablet and iPad are both required V1 targets.
- Windows is supported after the tablet targets.
- Phones are lower priority but the UI should degrade gracefully.
- No backend is required for core V1 operation.
- No cloud account is required.
- Imported audio, generated stems, track metadata, cifras and setlists live locally.
- Stem splitting happens locally with ONNX Runtime Web + WebGPU using the simple five-stem model.
- The five canonical stems are always:
  1. Vocals
  2. Guitar
  3. Bass
  4. Drums
  5. Other
- A plain browser-decodable audio file is a valid playable track even when it has no stems.
- The original source audio is retained after stem separation but is not used for playback while a complete valid five-stem set exists.
- A track with incomplete/corrupt stems falls back to its original audio and is treated as "no stems" for performance purposes.
- Setlists reference tracks; they do not duplicate audio.
- Reordering/adding/removing setlist items during a gig must never interrupt the current audio playback.
- Setlist changes are temporary until the user explicitly presses `SAVE`.
- Track-specific cifra auto-scroll speed always saves the last speed used.
- Chord diagrams are a hard V1 requirement, but should be implemented after the core player, setlist, storage, editor and splitting flows are stable.
- Complete setlists can be exported/imported as `.liveset` packages in V1.

## Critical performance rule

The following rule is non-negotiable:

> The currently playing song must continue playing while the musician opens the setlist drawer, imports a song, inserts it below any setlist row, removes a song, reorders songs, inserts/removes/reorders breaks, or closes the drawer.

The audio engine must not be recreated because a list changed or a view rerendered.

## Runtime structure note

Although two separate HTML prototype files are supplied, the final application must use a single long-lived PWA application shell. The Performance view and Track Editor/Stem Splitter view are application views, not independent page loads that destroy runtime state. This is especially important for the lifetime of the audio engine.

## Naming

Product name: **LiveSet 1**.

The screen represented by `splitstem.html` should be treated in code and documentation as the **Track Editor / Stem Splitter**. It is not limited to splitting. A user can open/import an audio track, edit metadata and cifra, save it without ever generating stems, or generate/replace stems.
