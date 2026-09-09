// App-wide settings persisted in the appSettings IndexedDB store. Each setting is
// a separate record keyed by id so we can atomically write one without loading all.

import {repository} from './storage.js?v=36';

const DEFAULTS = {
  fontScale: 1.0,          // multiplier on the cifra base font-size
  onboardingCompleted: false,
  pitchSync: false         // route playback through pitch-shift worklet on transpose
};

async function readOne(id) {
  try { const record = await repository.appSettings.get(id); return record?.value; }
  catch (_) { return undefined; }
}

export async function loadSettings() {
  const [fontScale, onboardingCompleted, pitchSync] = await Promise.all([
    readOne('fontScale'),
    readOne('onboardingCompleted'),
    readOne('pitchSync')
  ]);
  return {
    fontScale: typeof fontScale === 'number' ? fontScale : DEFAULTS.fontScale,
    onboardingCompleted: !!onboardingCompleted,
    pitchSync: !!pitchSync
  };
}

// Convert semitones (integer) → pitch ratio, clamped to the ±3 range the algorithm
// can shift transparently. Chart transpose can go wider; that's the caller's job.
export const PITCH_MAX_SEMITONES = 3;
export function pitchRatioFromSemitones(semitones) {
  const clamped = Math.max(-PITCH_MAX_SEMITONES, Math.min(PITCH_MAX_SEMITONES, Number(semitones) || 0));
  return Math.pow(2, clamped / 12);
}

export async function saveSetting(id, value) {
  try { await repository.appSettings.put({id, value}); return true; }
  catch (_) { return false; }
}

export function clampFontScale(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return DEFAULTS.fontScale;
  return Math.max(0.7, Math.min(2.0, Math.round(v * 100) / 100));
}
