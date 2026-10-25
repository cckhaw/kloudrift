// Procedural ambient audio for kloudrift. No samples: everything is synthesized.
//  - wind bed: two decorrelated noise streams (L/R) through slowly sweeping band-passes
//  - binaural drone: root note with a +3 Hz offset between ears (best on headphones)
//  - pad: slow chord progression in D major, scheduled ahead of time
//  - chimes / stabs: pentatonic spark pickups, soft chord pluck every 5th spark

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// D major pentatonic (MIDI) for sparks: D5 E5 F#5 A5 B5 D6
const PENTA = [74, 76, 78, 81, 83, 86];

// Dmaj9 → Bm9 → Gmaj7 → A6/9 (MIDI voicings)
const PROGRESSION = [
  [50, 57, 61, 64, 66],
  [47, 57, 62, 66, 69],
  [43, 59, 62, 66, 69],
  [45, 57, 61, 66, 71],
];
const CHORD_SECONDS = 9;

export class Synth {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.chordIndex = 0;
    this.nextChordAt = 0;
    this.timer = null;
    this.combo = 0;
    this.lastSparkAt = 0;
  }

  start() {
    if (this.ctx) {
      this.ctx.resume?.();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    // Simple generated reverb tail shared by pad and chimes.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(3.2, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.55;
    this.reverbSend.connect(this.reverb).connect(this.master);

    this.padBus = ctx.createGain();
    this.padBus.gain.value = 0.5;
    this.padBus.connect(this.master);
    this.padBus.connect(this.reverbSend);

    this.buildWind();
    this.buildDrone();

    this.nextChordAt = ctx.currentTime + 0.2;
    this.tick();
    this.timer = setInterval(() => this.tick(), 400);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  onVisibility = () => {
    if (!this.ctx) return;
    if (document.hidden) this.ctx.suspend();
    else this.ctx.resume();
  };

  setMuted(muted) {
    this.muted = muted;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(muted ? 0 : 0.8, t, 0.12);
  }

  makeImpulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  makeNoise(seconds = 4) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // brown-ish noise: soft, low-heavy, like distant air
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  buildWind() {
    const ctx = this.ctx;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.22;
    const merger = ctx.createChannelMerger(2);
    merger.connect(this.windGain).connect(this.master);
    this.windFilters = [];

    [0, 1].forEach((ch) => {
      const src = ctx.createBufferSource();
      src.buffer = this.makeNoise(4 + ch * 1.3); // different lengths → decorrelated loops
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 420 + ch * 90;
      bp.Q.value = 0.6;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.06 + ch * 0.035;
      const depth = ctx.createGain();
      depth.gain.value = 220;
      lfo.connect(depth).connect(bp.frequency);
      src.connect(bp).connect(merger, 0, ch);
      src.start();
      lfo.start();
      this.windFilters.push(bp);
    });
  }

  buildDrone() {
    const ctx = this.ctx;
    const root = mtof(38); // D2
    const g = ctx.createGain();
    g.gain.value = 0.05;
    g.connect(this.master);
    [
      [root, -1],
      [root + 3, 1], // 3 Hz difference between ears
    ].forEach(([f, pan]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      o.connect(p).connect(g);
      o.start();
    });
  }

  tick() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    while (this.nextChordAt < ctx.currentTime + 2) {
      this.playChord(PROGRESSION[this.chordIndex % PROGRESSION.length], this.nextChordAt);
      this.chordIndex++;
      this.nextChordAt += CHORD_SECONDS;
    }
  }

  currentChord() {
    return PROGRESSION[Math.max(0, this.chordIndex - 1) % PROGRESSION.length];
  }

  playChord(notes, when) {
    const ctx = this.ctx;
    notes.forEach((m, i) => {
      [-1, 1].forEach((side) => {
        const o = ctx.createOscillator();
        o.type = i < 2 ? 'triangle' : 'sine';
        o.frequency.value = mtof(m);
        o.detune.value = side * (4 + i);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1100;
        const g = ctx.createGain();
        const peak = 0.05 / (1 + i * 0.25);
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(peak, when + 3);
        g.gain.setValueAtTime(peak, when + CHORD_SECONDS - 3.2);
        g.gain.linearRampToValueAtTime(0.0001, when + CHORD_SECONDS + 3);
        const p = ctx.createStereoPanner();
        p.pan.value = side * (0.35 + i * 0.1);
        o.connect(lp).connect(g).connect(p).connect(this.padBus);
        o.start(when);
        o.stop(when + CHORD_SECONDS + 3.2);
      });
    });
  }

  note(midi, { type = 'triangle', gain = 0.12, attack = 0.01, decay = 1.4, when = 0, pan = 0, send = 0.8 } = {}) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = mtof(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p);
    p.connect(this.master);
    const s = ctx.createGain();
    s.gain.value = send;
    p.connect(s).connect(this.reverbSend);
    o.start(t);
    o.stop(t + decay + 0.1);
  }

  /** Soft pentatonic chime; climbs while sparks are collected in quick succession. */
  spark(multiplier = 1) {
    const now = performance.now();
    this.combo = now - this.lastSparkAt < 1400 ? this.combo + 1 : 0;
    this.lastSparkAt = now;
    const step = this.combo % PENTA.length;
    const pan = (Math.random() - 0.5) * 0.7;
    this.note(PENTA[step], { gain: 0.11, pan });
    this.note(PENTA[step] + 12, { type: 'sine', gain: 0.04, decay: 1.8, when: 0.02, pan });
    if (multiplier > 1) this.note(PENTA[(step + 2) % PENTA.length] - 12, { type: 'sine', gain: 0.05, when: 0.06, pan: -pan });
    // every fifth spark: a gentle acoustic chord stab from the current pad chord
    if (this.combo > 0 && this.combo % 5 === 0) {
      this.currentChord().forEach((m, i) => this.note(m + 12, { gain: 0.045, decay: 2.2, when: i * 0.045, pan: (i - 2) * 0.25 }));
    }
  }

  plant() {
    [62, 66, 69, 74, 78].forEach((m, i) => this.note(m, { type: 'sine', gain: 0.08, when: i * 0.08, decay: 2 }));
  }

  bottle() {
    this.note(86, { type: 'sine', gain: 0.07, decay: 1.6 });
    this.note(91, { type: 'sine', gain: 0.05, decay: 1.8, when: 0.12 });
  }

  /** Cushioned bounce off a storm front. */
  bump() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.55);
  }

  /** 0..1 — opens the wind up while riding a thermal. */
  setWind(intensity) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.22 + intensity * 0.18, t, 0.4);
    this.windFilters.forEach((f, i) => f.frequency.setTargetAtTime(420 + i * 90 + intensity * 500, t, 0.5));
  }
}
