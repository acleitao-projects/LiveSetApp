import {mkdir, writeFile} from 'node:fs/promises';

const defaultSampleRate = 8000;

export function wavFixture(seconds = 8, frequency = 440, {sampleRate = defaultSampleRate} = {}) {
  const count = sampleRate * seconds;
  const data = new Uint8Array(count * 2);
  const view = new DataView(data.buffer);
  for (let i = 0; i < count; i++) view.setInt16(i * 2, Math.round(Math.sin(2 * Math.PI * frequency * i / sampleRate) * 12000), true);
  const out = new Uint8Array(44 + data.length);
  const v = new DataView(out.buffer);
  const put = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  put(0, 'RIFF'); v.setUint32(4, 36 + data.length, true); put(8, 'WAVE');
  put(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  put(36, 'data'); v.setUint32(40, data.length, true); out.set(data, 44);
  return out;
}

export async function createFixtures(dir = 'test/fixtures') {
  await mkdir(dir, {recursive: true});
  const files = [];
  for (const [name, freq, seconds = 30] of [['track-a', 330], ['track-b', 440], ['track-c', 550], ['track-d', 660], ['track-e', 770], ['track-long', 275, 60]]) {
    const path = `${dir}/${name}.wav`;
    await writeFile(path, wavFixture(seconds, freq));
    files.push(path);
  }
  return files;
}

if (process.argv[1]?.endsWith('fixtures.mjs')) console.log((await createFixtures()).join('\n'));
