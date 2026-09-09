// LiveSet 1 — pitch-preserving-tempo shifter as an AudioWorkletProcessor.
//
// Algorithm: classic granular overlap-add. Each output grain of GRAIN samples is
// read from the input with a per-sample step of `pitchRatio`, giving a pitched
// grain. Successive grains advance the input read cursor by HOP samples (equal
// to the output write hop), so tempo is preserved. Grains are Hann-windowed and
// summed; gain is compensated for the 75%-overlap Hann sum.
//
// This is intentionally simple. Around ±3 semitones on stereo band mixes the
// artifacts are minor. Beyond ±5 you start to hear the classic granular warble.
// Real-time param updates arrive via port messages.

const GRAIN = 2048;      // ~46 ms at 44.1 kHz
const HOP = 512;         // 75% overlap → 4 grains active at once
const GAIN_COMP = 0.65;  // sum-of-shifted-Hann-windows ≈ 1.5 at 75% overlap

class PitchShifter extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.pitchRatio = options?.processorOptions?.pitchRatio ?? 1.0;

    // Precompute Hann window
    this.window = new Float32Array(GRAIN);
    for (let i = 0; i < GRAIN; i++) this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (GRAIN - 1));

    // Per-channel sample rings (grow on the tail, trim from the head as we consume)
    this.inputBuf = [[], []];
    this.outputBuf = [[], []];
    // Fractional input read cursor (in input samples relative to inputBuf[0..])
    this.inputReadPos = 0.0;
    // How much output has been accumulated but not yet emitted
    this.outputAccumLen = 0;

    this.port.onmessage = (event) => {
      const {pitchRatio} = event.data || {};
      if (typeof pitchRatio === 'number' && Number.isFinite(pitchRatio)) {
        this.pitchRatio = Math.max(0.5, Math.min(2.0, pitchRatio));
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input.length) return true;

    const numCh = Math.min(input.length, output.length, 2);
    const blockSize = output[0].length;

    // 1. Ingest incoming input samples per channel
    for (let ch = 0; ch < numCh; ch++) {
      const inp = input[ch];
      for (let i = 0; i < inp.length; i++) this.inputBuf[ch].push(inp[i]);
    }

    // 2. Emit as many grains as we have input for
    const inputNeededPerGrain = Math.ceil(GRAIN * this.pitchRatio) + 2;

    while (
      this.inputReadPos + inputNeededPerGrain <= this.inputBuf[0].length &&
      this.outputAccumLen < blockSize + GRAIN
    ) {
      for (let ch = 0; ch < numCh; ch++) {
        // Extend output accumulator to fit this grain
        const acc = this.outputBuf[ch];
        while (acc.length < this.outputAccumLen + GRAIN) acc.push(0);

        const inp = this.inputBuf[ch];
        const win = this.window;
        for (let i = 0; i < GRAIN; i++) {
          const srcPos = this.inputReadPos + i * this.pitchRatio;
          const idx = srcPos | 0;
          const frac = srcPos - idx;
          const a = inp[idx] || 0;
          const b = inp[idx + 1] || 0;
          acc[this.outputAccumLen + i] += (a + (b - a) * frac) * win[i];
        }
      }
      // Advance both cursors by the same HOP → tempo preserved
      this.inputReadPos += HOP;
      this.outputAccumLen += HOP;
    }

    // 3. Emit blockSize samples per channel; if under-run, output silence
    for (let ch = 0; ch < numCh; ch++) {
      const out = output[ch];
      const acc = this.outputBuf[ch];
      for (let i = 0; i < blockSize; i++) out[i] = (acc[i] || 0) * GAIN_COMP;
      // Drop the emitted samples
      acc.splice(0, blockSize);
    }
    this.outputAccumLen = Math.max(0, this.outputAccumLen - blockSize);

    // 4. Trim consumed input to keep memory bounded
    const trim = (this.inputReadPos | 0) - 2;
    if (trim > 0) {
      for (let ch = 0; ch < numCh; ch++) this.inputBuf[ch].splice(0, trim);
      this.inputReadPos -= trim;
    }

    return true;
  }
}

registerProcessor('pitch-shifter', PitchShifter);
