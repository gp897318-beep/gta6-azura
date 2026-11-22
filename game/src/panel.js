// The HUD for AZURA: job card, clock/money/wanted, APD dispatch, weapon
// rack, minimap, vitals, speed, radio, crew skills, district standing and
// the fixer dialogue. DOM over the 3D view, minimap on a 2D canvas.
import { districtAt, streetAt } from './town.js';

const GUNS = [
  { n: 1, name: 'FISTS', ammo: '∞' },
  { n: 2, name: 'PISTOL', ammo: '24' },
  { n: 3, name: 'SMG', ammo: '60' },
  { n: 4, name: 'SHOTGUN', ammo: '8' },
  { n: 5, name: 'RIFLE', ammo: '30' },
  { n: 6, name: 'SNIPER', ammo: '0' },
  { n: 7, name: 'LAUNCHER', ammo: '0' },
];

export class Panel {
  constructor() {
    this.el = {};
    const ids = ['jobCard', 'jobTitle', 'jobStage', 'jobGoal', 'jobClock', 'jobBar',
      'jobNext', 'clockBox', 'cashBox', 'starRow', 'wantedTag', 'rankTag', 'respectTag',
      'dispatchBox', 'standingBox', 'gunRow', 'mapCanvas', 'mapLabel', 'healthBar',
      'armorBar', 'speedNum', 'speedUnit', 'rideName', 'rideCond', 'radioBox',
      'garageBox', 'packBox', 'skillRow', 'talkBox', 'talkFace', 'talkName',
      'talkRole', 'talkText', 'hintLine', 'bannerLine'];
    for (const id of ids) this.el[id] = document.getElementById(id);
    this.mapCtx = this.el.mapCanvas.getContext('2d');
    this.gun = 2;
    this.talkLeft = 0;
    this.bannerLeft = 0;
  }

  setGun(i) { this.gun = i; }
  say(face, name, role, text, seconds) {
    this.el.talkFace.textContent = face;
    this.el.talkName.textContent = name;
    this.el.talkRole.textContent = role;
    this.el.talkText.textContent = text;
    this.el.talkBox.style.display = 'flex';
    this.talkLeft = seconds || 6;
  }
  shout(text, seconds) {
    this.el.bannerLine.textContent = text;
    this.el.bannerLine.style.display = 'block';
    this.bannerLeft = seconds || 3;
  }

  // snap: a plain snapshot the game builds each frame.
  refresh(dt, s) {
    // Job card: story job wins, else the active errand.
    const job = s.errand || s.job;
    if (job) {
      this.el.jobCard.style.display = 'block';
      this.el.jobTitle.textContent = `${job.code} — ${job.name}`;
      this.el.jobStage.textContent = job.stage || '';
      this.el.jobGoal.textContent = job.objective;
      this.el.jobClock.textContent = job.timer > 0 ? `⏱ ${Math.ceil(job.timer)}s` : '';
      this.el.jobBar.style.width = job.progressBar != null ? `${Math.round(job.progressBar * 100)}%` : '0%';
      this.el.jobNext.textContent = job.next || '';
    } else {
      this.el.jobCard.style.display = 'none';
    }
    // Clock / money / wanted.
    const mins = Math.floor(s.clock % 60);
    const hrs = Math.floor(s.clock / 60) % 24;
    this.el.clockBox.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    this.el.cashBox.textContent = `$${s.money.toLocaleString('en-US')}`;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < s.wanted ? '★' : '☆';
    this.el.starRow.textContent = stars;
    this.el.starRow.className = s.wanted > 0 ? 'stars lit' : 'stars';
    this.el.wantedTag.textContent = s.wanted === 0 ? 'CLEAN' : s.wanted >= 5 ? 'WANTED · SWAT' : s.wanted >= 3 ? 'WANTED · SEEN' : 'WANTED';
    this.el.rankTag.textContent = s.rank;
    this.el.respectTag.textContent = `RESPECT ${s.respect}`;
    // Dispatch panel.
    const rows = s.dispatch || [];
    this.el.dispatchBox.innerHTML = `<div class="panel-head">🚔 APD DISPATCH — ${rows.length} UNIT${rows.length === 1 ? '' : 'S'}</div>` +
      (rows.length
        ? rows.slice(0, 5).map((u) => `<div class="drow"><span>${u.name}</span><span>${u.dist}m</span><span class="st">${u.status}</span></div>`).join('') +
          (rows.length > 5 ? `<div class="drow"><span>+${rows.length - 5} MORE UNITS</span><span>—</span><span class="st">EN ROUTE</span></div>` : '')
        : '<div class="drow"><span>NO ACTIVE UNITS</span><span>—</span><span class="st">CLEAR</span></div>');
    // District standing.
    if (s.standing) {
      const names = Object.keys(s.standing);
      this.el.standingBox.innerHTML = '<div class="panel-head">🏙 DISTRICT STANDING</div>' +
        names.map((n) => `<div class="drow"><span>${n}</span><span>${s.standing[n]}</span><span class="st">${'●'.repeat(Math.min(5, Math.floor(s.standing[n] / 10))) || '○'}</span></div>`).join('');
    }
    // Weapon rack (shotgun unlocks after job 4, rifle after job 7).
    const open = { 4: s.jobsDone >= 4, 5: s.jobsDone >= 7, 6: false, 7: false };
    this.el.gunRow.innerHTML = GUNS.map((w) => {
      const locked = w.n >= 4 && !open[w.n];
      return `<div class="slot${w.n === this.gun ? ' on' : ''}${locked ? ' off' : ''}"><b>${w.n}</b> ${w.name}<span>${locked ? 'LOCKED' : w.ammo}</span></div>`;
    }).join('');
    // Vitals.
    this.el.healthBar.style.width = `${Math.max(0, s.health)}%`;
    this.el.armorBar.style.width = `${Math.max(0, s.armor)}%`;
    // Speed + ride.
    this.el.speedNum.textContent = s.inCar ? String(Math.round(Math.abs(s.mph))) : '—';
    this.el.speedUnit.textContent = s.inCar ? 'MPH' : '';
    this.el.rideName.textContent = s.inCar ? s.rideName : 'ON FOOT';
    this.el.rideCond.textContent = s.inCar ? `CONDITION ${Math.round(s.cond)}%` : 'WALK — PRESS E NEAR A CAR';
    // Radio / garage / packages / skills.
    this.el.radioBox.textContent = `♪ ${s.radio}`;
    this.el.garageBox.textContent = `🔧 GARAGE ENG ${s.garage.engine}/3 • ARM ${s.garage.armor}/3 • NITRO ${s.garage.nitro}/2`;
    this.el.packBox.textContent = `📦 HIDDEN PACKAGES ${s.packs}/${s.packsTotal}`;
    this.el.skillRow.innerHTML = s.skills.map((a) =>
      `<div class="skill${a.ready ? '' : ' cooling'}"><b>${a.key}</b> ${a.name}<span>${a.ready ? 'READY' : a.cd + 's'}</span></div>`).join('');
    // Location.
    const d = districtAt(s.px, s.pz);
    this.el.mapLabel.textContent = `${streetAt(s.px, s.pz)} • ${d} — STANDING ${s.standing ? (s.standing[d] || 0) : 0}`;
    this.el.hintLine.textContent = s.hint || '';
    if (this.talkLeft > 0) { this.talkLeft -= dt; if (this.talkLeft <= 0) this.el.talkBox.style.display = 'none'; }
    if (this.bannerLeft > 0) { this.bannerLeft -= dt; if (this.bannerLeft <= 0) this.el.bannerLine.style.display = 'none'; }
    this.drawMap(s);
  }

  drawMap(s) {
    const c = this.mapCtx, W = 190, H = 190;
    c.clearRect(0, 0, W, H);
    c.save();
    c.beginPath(); c.arc(95, 95, 92, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(8,14,26,0.92)'; c.fillRect(0, 0, W, H);
    const scale = W / 620;
    const toMap = (x, z) => [95 + (x - s.px) * scale, 95 + (z - s.pz) * scale];
    // Sea (east) and harbor (south).
    c.fillStyle = '#1f6f8b';
    const [sx] = toMap(285, 0);
    c.fillRect(sx, 0, W, H);
    const [, hy] = toMap(0, 266);
    c.fillRect(0, hy, W, H);
    // Roads.
    c.strokeStyle = '#5a5a66'; c.lineWidth = 3;
    for (let x = -240; x <= 240; x += 80) {
      const [ax, ay] = toMap(x, -320); const [bx, by] = toMap(x, 320);
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
    }
    for (let z = -240; z <= 240; z += 80) {
      const [ax, ay] = toMap(-320, z); const [bx, by] = toMap(320, z);
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
    }
    // Objective.
    if (s.goal) {
      const [ox, oy] = toMap(s.goal.x, s.goal.z);
      c.fillStyle = '#ffd23a';
      c.beginPath(); c.arc(ox, oy, 7, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 2;
      c.beginPath(); c.arc(ox, oy, 11, 0, Math.PI * 2); c.stroke();
    }
    // Police dots.
    c.fillStyle = '#4a86ff';
    for (const u of s.dispatch || []) {
      const [ux, uy] = toMap(u.x, u.z);
      c.beginPath(); c.arc(ux, uy, 4, 0, Math.PI * 2); c.fill();
    }
    // Player arrow: the map has north (-z) up, so forward (sin h, cos h)
    // in world (x, z-down) points at canvas angle PI - h from up.
    c.save();
    c.translate(95, 95);
    c.rotate(Math.PI - s.heading);
    c.fillStyle = '#fff';
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(-6, 7); c.closePath(); c.fill();
    c.restore();
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 2;
    c.beginPath(); c.arc(95, 95, 92, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#fff'; c.font = 'bold 13px sans-serif'; c.textAlign = 'center';
    c.fillText('N', 95, 16);
  }
}
