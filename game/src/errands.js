// Side errands for AZURA: street races, taxi fares, courier drops, stunt
// rings and 12 hidden packages. Each errand is a small state machine the
// game ticks; markers are glowing rings the town renders.
import { makeRng } from './rng.js';

export const PACKAGE_SPOTS = [
  [-280, -240], [-80, -280], [120, -240], [240, -160], [-240, 40],
  [40, 120], [200, 40], [-160, 200], [80, 200], [260, -80],
  [-40, -200], [280, 160],
];

export const ERRAND_SPOTS = {
  race: [[-240, -240], [-80, -160], [80, -80], [200, 0], [240, 160]],
  taxi: [[-160, 80], [120, -120], [240, 200]],
  courier: [[-240, 160], [80, -200], [200, 120]],
  stunt: [[-80, 0], [80, -160], [160, 160]],
};

export class Errands {
  constructor(seed) {
    this.rng = makeRng(seed + 55);
    this.kind = null; // race | taxi | courier | stunt
    this.active = false;
    this.timer = 0;
    this.gate = 0;
    this.label = '';
    this.fare = 0;
    this.picked = 0; // packages collected
    this._pickup = null;
    this._drop = null;
  }
  get target() {
    if (this.kind === 'race' || this.kind === 'stunt') {
      const spots = ERRAND_SPOTS[this.kind];
      return spots ? spots[this.gate] : null;
    }
    if (this.kind === 'taxi' || this.kind === 'courier') {
      return this._pickup || this._drop;
    }
    return null;
  }
  start(kind) {
    if (this.active) return null;
    this.kind = kind;
    this.active = true;
    this.gate = 0;
    if (kind === 'race') { this.timer = 110; this.label = 'STREET RACE — Canal Loop'; this.fare = 800; }
    if (kind === 'taxi') {
      this.timer = 150; this.label = 'TAXI FARE — pick up the fare';
      this.fare = 350; this._pickup = ERRAND_SPOTS.taxi[this.rng.int(0, 2)];
      this._drop = ERRAND_SPOTS.taxi[(this.rng.int(0, 2) + 1) % 3];
    }
    if (kind === 'courier') {
      this.timer = 150; this.label = 'COURIER DROP — grab the parcel';
      this.fare = 450; this._pickup = ERRAND_SPOTS.courier[this.rng.int(0, 2)];
      this._drop = ERRAND_SPOTS.courier[(this.rng.int(0, 2) + 1) % 3];
    }
    if (kind === 'stunt') { this.timer = 90; this.label = 'STUNT RINGS — thread all three'; this.fare = 600; }
    return this.label;
  }
  // ctx: {px, pz, inCar}. Returns {done, reward} when finished, 'failed', or null.
  update(dt, ctx) {
    if (!this.active) return null;
    this.timer -= dt;
    if (this.timer <= 0) { this.active = false; this.kind = null; return 'failed'; }
    const near = (p, r) => {
      if (!p) return false;
      const dx = ctx.px - p[0], dz = ctx.pz - p[1];
      return dx * dx + dz * dz < r * r;
    };
    if (this.kind === 'race' || this.kind === 'stunt') {
      const spots = ERRAND_SPOTS[this.kind];
      const g = spots[this.gate];
      if (g && near(g, this.kind === 'stunt' ? 10 : 13)) {
        this.gate++;
        if (this.gate >= spots.length) {
          const reward = this.fare;
          this.active = false; this.kind = null;
          return { done: true, reward };
        }
      }
    } else if (this.kind === 'taxi' || this.kind === 'courier') {
      if (this._pickup && near(this._pickup, 10)) { this._pickup = null; this.label = this.kind === 'taxi' ? 'TAXI FARE — deliver the passenger' : 'COURIER DROP — deliver the parcel'; }
      else if (!this._pickup && this._drop && near(this._drop, 10)) {
        const reward = this.fare;
        this.active = false; this.kind = null; this._drop = null;
        return { done: true, reward };
      }
    }
    return null;
  }
  progressText() {
    if (!this.active) return '';
    if (this.kind === 'race' || this.kind === 'stunt') return `GATE ${this.gate + 1}/${ERRAND_SPOTS[this.kind].length}`;
    if (this.kind === 'taxi' || this.kind === 'courier') return this._pickup ? 'PICK UP' : 'DELIVER';
    return '';
  }
  reset() {
    this.kind = null; this.active = false; this.timer = 0; this.gate = 0;
    this.label = ''; this.fare = 0; this._pickup = null; this._drop = null;
  }
}
