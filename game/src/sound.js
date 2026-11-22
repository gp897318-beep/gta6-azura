// Tiny WebAudio synth for AZURA: engine hum, sirens, gunshots, pickups,
// radio blips. No audio files — everything is generated, so the game
// stays offline and self-contained. Silent until the first user gesture.
const STATIONS = [
  'AZURA FM 91.7 — Golden Static',
  'CANAL WAVE 99.3 — Neon Tide',
  'SUNSET 104.1 — Dusk Drive',
];

export class Sound {
  constructor() {
    this.ctx = null;
    this.station = 0;
    this.muted = false;
    this._engineOsc = null;
    this._engineGain = null;
    this._sirenTimer = 0;
  }
  get stationName() { return STATIONS[this.station]; }
  nextStation() {
    this.station = (this.station + 1) % STATIONS.length;
    this.blip(660, 0.07);
    return this.stationName;
  }
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch { this.ctx = null; }
  }
  _tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  blip(freq, dur) { this._tone(freq || 880, dur || 0.06, 'square', 0.05); }
  pickup() { this._tone(520, 0.09, 'sine', 0.1, 780); }
  cash() { this._tone(880, 0.08, 'triangle', 0.1); setTimeout(() => this._tone(1320, 0.12, 'triangle', 0.1), 70); }
  shot() { this._tone(180, 0.12, 'sawtooth', 0.16, 60); }
  crash() { this._tone(90, 0.25, 'sawtooth', 0.2, 40); }
  horn() { this._tone(370, 0.18, 'square', 0.07, 330); }
  denied() { this._tone(160, 0.15, 'square', 0.08, 120); }
  // Two-tone police siren, called every frame while wanted > 0.
  siren(dt) {
    if (!this.ctx || this.muted) return;
    this._sirenTimer -= dt;
    if (this._sirenTimer <= 0) {
      this._sirenTimer = 0.45;
      this._tone(this._sirenHi ? 620 : 920, 0.4, 'sine', 0.035);
      this._sirenHi = !this._sirenHi;
    }
  }
  // Continuous engine note whose pitch follows speed. Call each frame.
  engine(running, speed01) {
    if (!this.ctx) return;
    if (!running) {
      if (this._engineOsc) { try { this._engineOsc.stop(); } catch { /* already stopped */ } this._engineOsc = null; }
      return;
    }
    if (!this._engineOsc) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = 55;
      g.gain.value = 0.0;
      o.connect(g).connect(this.ctx.destination);
      o.start();
      this._engineOsc = o; this._engineGain = g;
    }
    this._engineOsc.frequency.value = 55 + speed01 * 110;
    this._engineGain.gain.value = 0.02 + speed01 * 0.03;
  }
}
