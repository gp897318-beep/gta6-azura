// The story of AZURA: 10 jobs from fixer Luna Marlowe for driver Kai Mercer.
// Each job is a short stage list; a stage completes when its condition is
// met, then the next stage (or the payout) fires. The game drives it by
// calling update() with the live context every frame.
export const FIXER = { name: 'LUNA MARLOWE', role: 'FIXER — AZURA' };

const JOBS = [
  {
    code: 'JOB 01', name: 'FIRST LIGHT',
    brief: 'First job, kid. Drive to the Marina Canal marker and check in.',
    stages: [{ kind: 'goto', x: -40, z: -160, label: 'Drive to the Marina Canal marker' }],
    reward: 400, time: 120,
  },
  {
    code: 'JOB 02', name: 'THE PALM TAXI',
    brief: 'A Palm Taxi is parked on Palm Dr. Take it — and bring it to the Neon Wharf.',
    stages: [
      { kind: 'steal', model: 'taxi', label: 'Steal a PALM TAXI (press E near one)' },
      { kind: 'goto', x: 160, z: 80, label: 'Deliver the taxi to Neon Wharf' },
    ],
    reward: 600, time: 180,
  },
  {
    code: 'JOB 03', name: 'NEON DROP',
    brief: 'On foot from here. Grab the package at the Neon Wharf sign, then walk it to Old Harbor.',
    stages: [
      { kind: 'goto', x: 200, z: 160, onFoot: true, label: 'Pick up the package at Neon Wharf' },
      { kind: 'goto', x: -200, z: 200, onFoot: true, label: 'Deliver it on foot to Old Harbor' },
    ],
    reward: 700, time: 180,
  },
  {
    code: 'JOB 04', name: 'RAM THE REGENT',
    brief: 'A rival is showing off a Solstice GT on Sunset Blvd. Ram it until it stalls.',
    stages: [{ kind: 'ram', model: 'solstice', label: 'Ram the SOLSTICE GT until it stalls' }],
    reward: 900, time: 150,
  },
  {
    code: 'JOB 05', name: 'THE GETAWAY',
    brief: 'You are hot — three stars and climbing. Lose them. Break line of sight and vanish.',
    stages: [{ kind: 'escape', stars: 3, label: 'Lose the heat — get back to CLEAN' }],
    reward: 1000, time: 180,
  },
  {
    code: 'JOB 06', name: 'CANAL RUN',
    brief: 'Five gates, one canal road, no brakes. Beat the clock.',
    stages: [{ kind: 'race', gates: [[-240, -80], [-80, -80], [80, -80], [160, 0], [240, 80]], label: 'Race the gates along the canal road' }],
    reward: 1200, time: 120,
  },
  {
    code: 'JOB 07', name: 'HARBOUR HEIST',
    brief: 'The Azura Star is parked by the harbor. Steal it and bring it to the garage.',
    stages: [
      { kind: 'steal', model: 'star', label: 'Steal the AZURA STAR at the harbor' },
      { kind: 'goto', x: -180, z: 250, label: 'Deliver it to the Old Harbor garage' },
    ],
    reward: 1500, time: 240,
  },
  {
    code: 'JOB 08', name: 'SWAT STORM',
    brief: 'Four stars. They are sending everything. Survive forty-five seconds.',
    stages: [{ kind: 'survive', stars: 4, seconds: 45, label: 'Survive the 4-star storm — 45s' }],
    reward: 1800, time: 60,
  },
  {
    code: 'JOB 09', name: 'FIVE-STAR STORM',
    brief: 'Five stars, kid. SWAT is rolling. Forty-five seconds of hell — then you disappear.',
    stages: [{ kind: 'survive', stars: 5, seconds: 45, label: 'Survive the 5-star storm — 45s' }],
    reward: 2500, time: 60,
  },
  {
    code: 'JOB 10', name: 'LAST LIGHT',
    brief: 'Last job. Take the Neon Falcon from the wharf, shake the tail, and bring it home.',
    stages: [
      { kind: 'steal', model: 'falcon', label: 'Steal the NEON FALCON at Neon Wharf' },
      { kind: 'escape', stars: 2, label: 'Lose the tail' },
      { kind: 'goto', x: -160, z: -160, label: 'Bring it home to Marina Canal' },
    ],
    reward: 3500, time: 300,
  },
];

export class Story {
  constructor() {
    this.index = 0; // next job to start
    this.state = 'idle'; // idle | active | done
    this.stage = 0;
    this.timer = 0;
    this.progress = '';
    this._ramTarget = null;
    this._gateIdx = 0;
    this._surviveLeft = 0;
  }
  get job() { return JOBS[this.index] || null; }
  get jobsDone() { return this.index; }
  current() {
    if (this.state !== 'active' || !this.job) return null;
    const st = this.job.stages[this.stage];
    return {
      code: this.job.code, name: this.job.name,
      objective: st ? st.label : this.job.brief,
      timer: this.timer, progress: this.progress,
      id: this.index + 1,
    };
  }
  start() {
    if (!this.job || this.state === 'active') return null;
    this.state = 'active';
    this.stage = 0;
    this.timer = this.job.time;
    this.progress = '';
    this._gateIdx = 0;
    this._surviveLeft = this.job.stages[0] && this.job.stages[0].kind === 'survive' ? this.job.stages[0].seconds : 0;
    return this.job;
  }
  // ctx: {px, pz, inCar, carModel, wanted, rammed (fn), gatePos}
  // Returns 'done' | 'failed' | null. Sets this.progress.
  update(dt, ctx) {
    if (this.state !== 'active' || !this.job) return null;
    this.timer -= dt;
    if (this.timer <= 0) { this.state = 'idle'; return 'failed'; }
    const st = this.job.stages[this.stage];
    if (!st) { this.state = 'idle'; return 'failed'; }
    const reach = (x, z, r) => {
      const dx = ctx.px - x, dz = ctx.pz - z;
      return dx * dx + dz * dz < r * r;
    };
    if (st.kind === 'goto') {
      this.progress = `${Math.round(Math.hypot(ctx.px - st.x, ctx.pz - st.z))}m`;
      if (st.onFoot && ctx.inCar) { this.progress += ' — ON FOOT'; return null; }
      if (reach(st.x, st.z, 12)) return this._advance();
    } else if (st.kind === 'steal') {
      if (ctx.inCar && ctx.carModel === st.model) return this._advance();
      this.progress = 'FIND IT';
    } else if (st.kind === 'ram') {
      const hp = ctx.ramTargetHp != null ? ctx.ramTargetHp : 100;
      this.progress = `TARGET ${Math.max(0, Math.round(hp))}%`;
      if (hp <= 0) return this._advance();
    } else if (st.kind === 'escape') {
      if (ctx.wanted >= st.stars && !this._escapeArmed) { this._escapeArmed = true; }
      if (this._escapeArmed) {
        this.progress = ctx.wanted > 0 ? `WANTED ${ctx.wanted}★` : 'CLEAN';
        if (ctx.wanted === 0) return this._advance();
      } else {
        this.progress = 'GET NOTICED FIRST';
      }
    } else if (st.kind === 'race') {
      const g = st.gates[this._gateIdx];
      if (g) {
        this.progress = `GATE ${this._gateIdx + 1}/${st.gates.length}`;
        if (reach(g[0], g[1], 14)) { this._gateIdx++; if (this._gateIdx >= st.gates.length) return this._advance(); }
      }
    } else if (st.kind === 'survive') {
      this._surviveLeft -= dt;
      this.progress = `${Math.ceil(Math.max(0, this._surviveLeft))}s`;
      if (this._surviveLeft <= 0) return this._advance();
    }
    return null;
  }
  _advance() {
    this.stage++;
    this._gateIdx = 0;
    this._escapeArmed = false;
    if (this.stage >= this.job.stages.length) {
      const reward = this.job.reward;
      this.index++;
      this.state = 'idle';
      this.progress = '';
      return { done: true, reward };
    }
    const st = this.job.stages[this.stage];
    if (st.kind === 'survive') this._surviveLeft = st.seconds;
    return null;
  }
  reset() {
    this.index = 0; this.state = 'idle'; this.stage = 0; this.timer = 0;
    this.progress = ''; this._gateIdx = 0; this._surviveLeft = 0; this._escapeArmed = false;
  }
}
