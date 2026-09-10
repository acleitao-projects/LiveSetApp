// Backup / restore of the whole app.
//
// Format: a single JSON file. Contains all songs, setlists, appSettings, and any
// OPFS-copy audio files (base64-encoded). Songs with kind:'handle' keep their
// metadata but drop the handle (handles are not portable across devices) — after
// restore, the user re-picks the file and dedupe reuses the record automatically.

import {repository, readOpfsFile, writeOpfsFile, removeOpfsPath} from './storage.js?v=39';
import {SCHEMA_VERSION} from './models.js?v=39';

const MANIFEST_VERSION = 1;

function b64encode(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}
function b64decode(text) {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function readOpfsBytes(path) {
  const file = await readOpfsFile(path);
  return new Uint8Array(await file.arrayBuffer());
}

function serializableSong(song) {
  // File System handles are per-device and per-permission — strip them; keep
  // enough metadata that dedupe by filename+size still reunites on restore.
  const copy = {...song};
  if (copy.source?.kind === 'handle') copy.source = {kind: 'stale-handle', originalKind: 'handle'};
  return copy;
}

export async function createBackup() {
  const [songs, setlists, settings] = await Promise.all([
    repository.songs.all(),
    repository.setlists.all(),
    repository.appSettings.all()
  ]);
  const files = {};
  for (const song of songs) {
    if (song.source?.kind === 'opfs' && song.source.path) {
      try {
        const bytes = await readOpfsBytes(song.source.path);
        files[song.source.path] = b64encode(bytes);
      } catch (_) { /* audio missing — skip */ }
    }
  }
  return {
    format: 'liveset-backup',
    manifestVersion: MANIFEST_VERSION,
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    songs: songs.map(serializableSong),
    setlists,
    settings,
    files
  };
}

export function backupBlob(backup) {
  return new Blob([JSON.stringify(backup)], {type: 'application/json'});
}

export async function restoreBackup(backup, {mode = 'merge'} = {}) {
  if (!backup || backup.format !== 'liveset-backup') throw Error('invalid_backup');
  if (backup.manifestVersion > MANIFEST_VERSION) throw Error('newer_backup');

  const summary = {songs: 0, setlists: 0, settings: 0, files: 0, skipped: 0};

  if (mode === 'replace') {
    // Wipe current state before restoring.
    for (const s of await repository.songs.all()) await repository.songs.delete(s.id);
    for (const s of await repository.setlists.all()) await repository.setlists.delete(s.id);
    for (const s of await repository.appSettings.all()) await repository.appSettings.delete(s.id);
    try { await removeOpfsPath('songs', {recursive: true}); } catch (_) { /* ignore */ }
  }

  // Files first so song source paths resolve on first read.
  for (const [path, base64] of Object.entries(backup.files || {})) {
    try {
      const bytes = b64decode(base64);
      const blob = new Blob([bytes]);
      await writeOpfsFile(path, blob);
      summary.files++;
    } catch (_) { summary.skipped++; }
  }

  for (const song of backup.songs || []) {
    try {
      await repository.songs.put(song);
      summary.songs++;
    } catch (_) { summary.skipped++; }
  }
  for (const setlist of backup.setlists || []) {
    try { await repository.setlists.put(setlist); summary.setlists++; }
    catch (_) { summary.skipped++; }
  }
  for (const setting of backup.settings || []) {
    try { await repository.appSettings.put(setting); summary.settings++; }
    catch (_) { summary.skipped++; }
  }

  return summary;
}

// ---------- Setlist share (references only, no audio) ----------

export function shareSetlist(setlist, songs) {
  const songIds = new Set(setlist.items.filter(i => i.type === 'track').map(i => i.songId));
  const referencedSongs = songs.filter(s => songIds.has(s.id)).map(song => ({
    id: song.id,
    title: song.title,
    artist: song.artist,
    originalFilename: song.originalFilename,
    originalSize: song.originalSize,
    durationSeconds: song.durationSeconds,
    cifraSource: song.cifraSource,
    transposeSemitones: song.transposeSemitones,
    notes: song.notes || ''
  }));
  return {
    format: 'liveset-setlist',
    manifestVersion: MANIFEST_VERSION,
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    setlist,
    songs: referencedSongs
  };
}

export function setlistBlob(share) {
  return new Blob([JSON.stringify(share)], {type: 'application/json'});
}

export async function importSetlistShare(share) {
  if (!share || share.format !== 'liveset-setlist') throw Error('invalid_setlist_share');
  const existingSongs = await repository.songs.all();
  const byId = new Map(existingSongs.map(s => [s.id, s]));
  const byFingerprint = new Map(existingSongs.map(s => [`${s.originalFilename}::${s.originalSize}`, s]));

  const idRemap = new Map();
  for (const stub of share.songs || []) {
    if (byId.has(stub.id)) { idRemap.set(stub.id, stub.id); continue; }
    const fp = `${stub.originalFilename}::${stub.originalSize}`;
    const local = byFingerprint.get(fp);
    if (local) {
      // Local audio exists but under a different id; remap the setlist's ref
      idRemap.set(stub.id, local.id);
      // Merge cifra/notes/transpose if the local record is empty
      if (!local.cifraSource && stub.cifraSource) local.cifraSource = stub.cifraSource;
      if (!local.notes && stub.notes) local.notes = stub.notes;
      if (!local.transposeSemitones && stub.transposeSemitones) local.transposeSemitones = stub.transposeSemitones;
      local.updatedAt = new Date().toISOString();
      await repository.songs.put(local);
    } else {
      // Create a placeholder song (no audio source). The user will be prompted
      // to attach a file when they try to play it.
      const placeholder = {
        ...stub,
        source: null,
        cifraScrollSpeed: 1,
        cifraAutoScrollEnabled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        schemaVersion: share.schemaVersion || SCHEMA_VERSION
      };
      await repository.songs.put(placeholder);
      idRemap.set(stub.id, stub.id);
    }
  }

  // Rewrite setlist item songIds through the remap
  const setlist = structuredClone(share.setlist);
  setlist.items = (setlist.items || []).map(item => {
    if (item.type === 'track') {
      const mapped = idRemap.get(item.songId) || item.songId;
      return {...item, songId: mapped};
    }
    return item;
  });
  return {setlist, imported: share.songs?.length || 0};
}
