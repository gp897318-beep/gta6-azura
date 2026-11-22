// AZURA PD: wanted level, dispatch units, chases, roadblocks, PIT moves,
// SWAT at five stars, and the SKYHOOK-1 helicopter with a spotlight.
// Units are named, distanced and statused so the HUD dispatch panel can
// read them straight off.
import { makeRng, clamp, turnToward, dist2 } from './rng.js';
import { Ride, modelById } from './rides.js';

const UNIT_NAMES = ['MANTA-12', 'REEF-07', 'TIDE-23', 'SURGE-31', 'CORAL-44', 'WAVE-18', 'SHARK-09', 'DUNE-05', 'FOAM-27', 'KELP-14'];
const SWAT_NAMES = ['SWAT-1', 'SWAT-2', 'SWAT-3'];
const COP_MODEL = { id: 'cop', name: 'APD INTERCEPTOR', color: 0xf2f2f2, top: 44, accel: 27, grip: 2.8 };
const SWAT_MODEL = { id: 'swat', name: 'APD SWAT VAN', color: 0x1a2a1a, top: 38, accel: 20, grip: 2.2 };

export class Cops {
  constructor(scene, seed, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = makeRng(seed + 91);
    this.wanted = 0;
    this.heat = 0;
    this.units = []; // {name, status, ride, role, swat}
    this.heli = null; // {mesh, cone, ring, angle}
    this.busted = 0; // seconds a unit has been on top of the player
    this._nameIdx = 0;
  }

  _nextName(swat) {
    if (swat) return SWAT_NAMES[this.units.filter((u) => u.swat).length % SWAT_NAMES.length];
    return UNIT_NAMES[this._nameIdx++ % UNIT_NAMES.length];
  }

  _spawnUnit(px, pz, swat) {
    const rng = this.rng;
    const ang = rng.next() * Math.PI * 2;
    const d = rng.range(60, 110);
    const x = clamp(px + Math.sin(ang) * d, -320, 310);
    const z = clamp(pz + Math.cos(ang) * d, -320, 255);
    const ride = new Ride(this.scene, swat ? SWAT_MODEL : COP_MODEL, x, z, Math.atan2(px - x, pz - z), true);
    const u = { name: this._nextName(swat), status: 'PURSUE', ride, role: 'chase', swat: !!swat, blockTimer: 0 };
    this.units.push(u);
    return u;
  }

  _spawnHeli(px, pz) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 6),
      new THREE.MeshLambertMaterial({ color: 0x223044 }));
    g.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.5),
      new THREE.MeshLambertMaterial({ color: 0x223044 }));
    tail.position.set(0, 0.3, -5);
    g.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.6),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    rotor.position.y = 1.1;
    g.add(rotor);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
    lamp.position.set(0, -0.9, 1.5);
    g.add(lamp);
    // Spotlight cone + ground pool (heli flies at y=20).
    const cone = new THREE.Mesh(new THREE.ConeGeometry(8, 20, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }));
    cone.position.y = -10;
    g.add(cone);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(8, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.22 }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = -19;
    g.add(pool);
    g.position.set(px + 30, 20, pz - 20);
    this.scene.add(g);
    this.heli = { mesh: g, rotor, cone, pool, angle: 0.6, x: px + 30, z: pz - 20 };
  }

  _removeHeli() {
    if (!this.heli) return;
    this.scene.remove(this.heli.mesh);
    this.heli = null;
  }

  setWanted(n) { this.wanted = clamp(n, 0, 5); }

  // How many ground units the wanted level calls for.
  _targetCount() { return [0, 2, 3, 5, 6, 8][this.wanted]; }

  update(dt, px, pz, playerSpeed, onFoot) {
    // Wanted follows heat; while wanted, heat cools off, and when it hits
    // zero the level steps down one star (heat re-seeds just under the new
    // level's band so it does not bounce straight back up).
    if (this.wanted > 0) this.heat = Math.max(0, this.heat - dt * 1.6);
    const fromHeat = this.heat < 20 ? 0 : this.heat < 40 ? 1 : this.heat < 55 ? 2 : this.heat < 70 ? 3 : this.heat < 85 ? 4 : 5;
    if (fromHeat > this.wanted) this.wanted = fromHeat;
    else if (this.heat <= 0 && this.wanted > 0) {
      this.wanted -= 1;
      this.heat = [0, 19, 39, 54, 69][this.wanted];
    }
    const want = this._targetCount();
    // Spawn up to the target, despawn extras.
    while (this.units.length < want) {
      const swat = this.wanted >= 5 && this.units.filter((u) => u.swat).length < 2;
      this._spawnUnit(px, pz, swat);
    }
    while (this.units.length > want) {
      const u = this.units.pop();
      u.ride.remove(this.scene);
    }
    // Heli at 3+ stars.
    if (this.wanted >= 3 && !this.heli) this._spawnHeli(px, pz);
    if (this.wanted < 3 && this.heli) this._removeHeli();

    // Drive each unit toward the player, with roles.
    let nearest = 1e9;
    for (const u of this.units) {
      const r = u.ride;
      const d = dist2(r.x, r.z, px, pz);
      if (d < nearest) nearest = d;
      // Role assignment by distance + wanted.
      if (this.wanted >= 4 && d < 14 && u.role !== 'pit') { u.role = 'pit'; u.status = 'PIT'; }
      else if (u.role === 'pit' && d > 30) { u.role = 'chase'; u.status = 'PURSUE'; }
      if (u.role === 'block') {
        u.blockTimer -= dt;
        if (u.blockTimer <= 0) { u.role = 'chase'; u.status = 'PURSUE'; }
        continue; // parked roadblock
      }
      // Aim point: ahead of the player if chasing fast, else the player.
      let tx = px, tz = pz;
      if (u.role === 'pit') {
        // Sideswipe: aim slightly to the player's side.
        tx = px + Math.cos(Math.atan2(px - r.x, pz - r.z)) * 4;
        tz = pz - Math.sin(Math.atan2(px - r.x, pz - r.z)) * 4;
      }
      const wantHeading = Math.atan2(tx - r.x, tz - r.z);
      const diff = (() => { let d0 = wantHeading - r.heading; while (d0 > Math.PI) d0 -= Math.PI * 2; while (d0 < -Math.PI) d0 += Math.PI * 2; return d0; })();
      const steer = clamp(diff * 1.6, -1, 1);
      const throttle = d > 8 ? 1 : 0.4;
      r.drive(steer, throttle, dt, this.colliders, false);
      // Status text from behaviour.
      if (u.role === 'pit') u.status = 'PIT';
      else if (d < 12) u.status = 'RAMMING';
      else if (Math.abs(diff) > 0.9) u.status = 'FLANKING';
      else if (d < 30) u.status = 'CLOSING IN';
      else u.status = 'PURSUE';
      // Roadblock: at 2+ stars, one unit sometimes parks ahead.
      if (this.wanted >= 2 && this.rng.next() < dt * 0.06 && this.units.filter((v) => v.role === 'block').length < 1) {
        u.role = 'block'; u.status = 'ROADBLOCK'; u.blockTimer = 9;
        const ahead = Math.atan2(px - r.x, pz - r.z);
        r.x = clamp(px + Math.sin(ahead) * 26, -320, 310);
        r.z = clamp(pz + Math.cos(ahead) * 26, -320, 255);
        r.mesh.position.set(r.x, 0, r.z);
      }
      // Contact: busted when a unit sits on the player on foot.
      if (onFoot && d < 4.5 && playerSpeed < 2) this.busted += dt;
    }
    if (nearest > 8) this.busted = Math.max(0, this.busted - dt * 2);

    // Helicopter orbit + spotlight.
    if (this.heli) {
      const h = this.heli;
      h.angle += dt * 0.35;
      h.x = px + Math.sin(h.angle) * 34;
      h.z = pz + Math.cos(h.angle) * 34;
      h.mesh.position.set(h.x, 20, h.z);
      h.mesh.rotation.y = Math.atan2(px - h.x, pz - h.z);
      h.rotor.rotation.y += dt * 22;
      // The light pool tracks the player on the ground; the cone hangs
      // straight down from the heli (its axis is vertical by design).
      h.pool.position.set(px - h.x, -19, pz - h.z);
    }
  }

  // HUD rows: name, distance, status, position.
  rows(px, pz) {
    const rows = this.units.map((u) => ({
      name: u.name, dist: Math.round(dist2(u.ride.x, u.ride.z, px, pz)),
      status: u.status, x: u.ride.x, z: u.ride.z,
    }));
    if (this.heli) rows.unshift({ name: 'SKYHOOK-1', dist: 20, status: 'SPOTLIGHT', x: this.heli.x, z: this.heli.z });
    return rows;
  }

  // Stage a chase for a screenshot: units around a point, heli overhead.
  stageChase(px, pz, heading) {
    while (this.units.length) { const u = this.units.pop(); u.ride.remove(this.scene); }
    this.wanted = 5; this.heat = 88;
    const spots = [[-14, -18, 'RAMMING'], [16, -12, 'FLANKING'], [-22, 8, 'PURSUE'], [20, 14, 'CLOSING IN'], [-8, 26, 'PURSUE'], [28, -22, 'RAMMING']];
    for (const [dx, dz, st] of spots) {
      const swat = this.units.length >= 5;
      const u = this._spawnUnit(px + dx, pz + dz, swat);
      u.ride.x = px + dx; u.ride.z = pz + dz;
      u.ride.heading = heading + Math.PI;
      u.ride.mesh.position.set(u.ride.x, 0, u.ride.z);
      u.ride.mesh.rotation.y = u.ride.heading;
      u.status = st;
    }
    if (!this.heli) this._spawnHeli(px, pz);
    this.heli.x = px + 14; this.heli.z = pz - 34;
    this.heli.mesh.position.set(this.heli.x, 20, this.heli.z);
  }

  stageRoadblock(px, pz, heading) {
    const ahead = heading;
    for (let i = 0; i < 2; i++) {
      const u = this._spawnUnit(px, pz, false);
      const bx = px + Math.sin(ahead) * (30 + i * 6) + (i === 0 ? -6 : 6);
      const bz = pz + Math.cos(ahead) * (30 + i * 6);
      u.ride.x = bx; u.ride.z = bz;
      u.ride.heading = heading + Math.PI / 2;
      u.ride.mesh.position.set(bx, 0, bz);
      u.ride.mesh.rotation.y = u.ride.heading;
      u.role = 'block'; u.status = 'ROADBLOCK'; u.blockTimer = 60;
    }
  }

  clear() {
    while (this.units.length) { const u = this.units.pop(); u.ride.remove(this.scene); }
    this._removeHeli();
    this.wanted = 0; this.heat = 0; this.busted = 0;
  }
}
