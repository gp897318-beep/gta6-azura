// AZURA — an open-world crime game. Third-person on foot and by car,
// traffic, pedestrians, a wanted level with APD chases, SWAT and the
// SKYHOOK-1 helicopter, a 10-job story, side errands, district standing,
// day/night, rain, garage upgrades, combat, HUD + minimap, start screen
// and saves. The loop runs on requestAnimationFrame: update(dt), render,
// then a HUD refresh.
//
// ?seed=N fixes the world. ?shot=cover|drive|mission|menu stages that
// scene instead of free play, paints it a few times and sets
// window.__shotReady.
import { makeRng, clamp, turnToward, dist2 } from './rng.js';
import { Keys } from './keys.js';
import { Sound } from './sound.js';
import { buildTown, DISTRICTS, HALF } from './town.js';
import { RIDE_MODELS, modelById, Ride, Traffic, hitsBox } from './rides.js';
import { Walkers } from './walkers.js';
import { Cops } from './cops.js';
import { Story, FIXER } from './story.js';
import { Errands, PACKAGE_SPOTS } from './errands.js';
import { Panel } from './panel.js';
import { stageShot } from './stage.js';

const SAVE_KEY = 'azura-save-v1';
const GARAGE_COSTS = { engine: [500, 1000, 2000], armor: [400, 900, 1800], nitro: [800, 1500] };
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

const RANKS = [
  [0, 'ROOKIE'], [20, 'HUSTLER'], [40, 'STREET BOSS'], [60, 'AZURA STAR'], [80, 'AZURA LEGEND'],
];
function rankFor(respect) {
  let r = 'ROOKIE';
  for (const [min, name] of RANKS) if (respect >= min) r = name;
  return r;
}

// Fixed parked cars the player can steal (model, x, z, heading).
const PARKED_SPOTS = [
  ['taxi', 236, -120, Math.PI], ['star', -120, 240, 0], ['falcon', 200, 160, Math.PI / 2],
  ['solstice', 80, -200, 0], ['tidal', -200, 40, Math.PI], ['sprinter', 160, -40, -Math.PI / 2],
  ['hawk', -80, 120, Math.PI], ['reef', 40, 200, 0],
];

class AzuraGame {
  constructor() {
    this.keys = new Keys();
    this.sound = new Sound();
    this.panel = new Panel();
    this.mode = 'menu';
    this.paused = false;
    this.time = 0;
    this.clockMin = 18 * 60 + 20;
    this.money = 1250;
    this.respect = 0;
    this.health = 100;
    this.armor = 50;
    this.gun = 2;
    this.ammo = { 2: 24, 3: 60, 4: 8, 5: 30, 6: 0, 7: 0 };
    this.settle = 0;
    this.cruiseShot = false;
    this.bustedTimer = 0;
    this.skills = [
      { key: 'Q', name: 'SWAP PLATES', cd: 0, max: 30, ready: true },
      { key: 'R', name: 'QUICK FIX', cd: 0, max: 20, ready: true },
      { key: 'V', name: 'EYES OUT', cd: 0, max: 15, ready: true },
    ];
    this.eyesOut = 0;
    this.story = new Story();
    this.errands = new Errands(seed);
    this.standing = {};
    for (const d of DISTRICTS) this.standing[d] = 0;
    this.garage = { engine: 0, armor: 0, nitro: 0 };
    this.garageOpen = false;
    this.nitroTimer = 0;
    this.nitroCd = 0;
    this.nitroLeft = 0;
    this.weather = 'CLEAR';
    this.weatherTimer = 75;
    this.effects = [];
    this.takenPacks = new Set();
    this.hint = '';
    this.hintTimer = 0;
    this.saveTimer = 0;
    this.ramTarget = null;
    this.ramHp = 100;
    this.loadSave();

    // --- Three.js scene ---
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8a5570);
    this.scene.fog = new THREE.Fog(0x8a5570, 150, 780);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1400);
    this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game'), antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const hemi = new THREE.HemisphereLight(0xb08ac8, 0x7a4a38, 1.15);
    this.scene.add(hemi);
    this.hemi = hemi;
    const sun = new THREE.DirectionalLight(0xff9a4a, 1.5);
    sun.position.set(320, 110, -140);
    this.scene.add(sun);
    this.sun = sun;

    const town = buildTown(this.scene, seed);
    this.colliders = town.colliders;
    this.traffic = new Traffic(this.scene, seed, this.colliders);
    this.cops = new Cops(this.scene, seed, this.colliders);
    this.walkers = new Walkers(this.scene, seed);

    // Player on foot.
    this.walker = this._buildWalkerMesh(0xe8384f);
    this.scene.add(this.walker);
    this.px = -160; this.pz = -160; this.heading = 0;
    this.walkSpeed = 0;
    this.inCar = false;
    this.playerRide = null;
    this.rideModel = null;

    // Parked cars.
    this.parked = [];
    for (const [id, x, z, h] of PARKED_SPOTS) {
      const ride = new Ride(this.scene, modelById(id), x, z, h, false);
      this.parked.push(ride);
    }

    // Errand marker rings.
    this.ringMeshes = [];
    const ringCols = { race: 0xffd23a, taxi: 0x22e6ff, courier: 0x3dff9e, stunt: 0xff7a4a };
    for (const kind of Object.keys(ringCols)) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(4.5, 6, 32),
        new THREE.MeshBasicMaterial({ color: ringCols[kind], side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.scene.add(ring);
      this.ringMeshes.push({ kind, mesh: ring });
    }
    // Garage ring at the Old Harbor garage.
    const gring = new THREE.Mesh(new THREE.RingGeometry(5, 6.5, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23a, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    gring.rotation.x = -Math.PI / 2;
    gring.position.set(-180, 0.15, 250);
    this.scene.add(gring);

    // Hidden packages: 12 glowing gold boxes.
    this.packMeshes = [];
    for (let i = 0; i < PACKAGE_SPOTS.length; i++) {
      const [x, z] = PACKAGE_SPOTS[i];
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9),
        new THREE.MeshLambertMaterial({ color: 0xffd23a, emissive: 0x8a6a00 }));
      box.position.set(x, 0.9, z);
      this.scene.add(box);
      this.packMeshes.push(box);
      if (this.takenPacks.has(i)) box.visible = false;
    }

    // Rain points that follow the player.
    const rainCount = 900;
    const rainPos = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPos[i * 3] = (Math.random() - 0.5) * 70;
      rainPos[i * 3 + 1] = Math.random() * 45;
      rainPos[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    this.rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0x9fb8d8, size: 0.35, transparent: true, opacity: 0.55 }));
    this.rain.visible = false;
    this.scene.add(this.rain);

    // Camera rig.
    this.camPos = new THREE.Vector3(-160, 8, -140);
    this.camLook = new THREE.Vector3(-160, 1, -160);

    this._wireMenu();
    this.showMenu();
  }

  _buildWalkerMesh(jacket) {
    const g = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
    const coat = new THREE.MeshLambertMaterial({ color: jacket });
    const pants = new THREE.MeshLambertMaterial({ color: 0x223044 });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), pants);
    legs.position.y = 0.4;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), coat);
    torso.position.y = 1.16;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), skin);
    head.position.y = 1.76;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 10),
      new THREE.MeshLambertMaterial({ color: 0x14141c }));
    cap.position.y = 1.98;
    g.add(legs, torso, head, cap);
    return g;
  }

  _wireMenu() {
    const startBtn = document.getElementById('startBtn');
    if (startBtn) startBtn.addEventListener('click', () => this.startGame(false));
    const contBtn = document.getElementById('continueBtn');
    if (contBtn) contBtn.addEventListener('click', () => this.startGame(true));
    const buy = (id, fn) => {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', fn);
    };
    buy('buyEngine', () => this.buyUpgrade('engine'));
    buy('buyArmor', () => this.buyUpgrade('armor'));
    buy('buyNitro', () => this.buyUpgrade('nitro'));
  }

  showMenu() {
    this.mode = 'menu';
    document.getElementById('menu').style.display = 'flex';
    document.getElementById('hud').style.display = 'none';
    const saveEl = document.getElementById('menuSave');
    if (saveEl) {
      saveEl.textContent = this._hasSave
        ? `SAVED CAREER — $${this.money.toLocaleString('en-US')} • ${this.story.jobsDone}/10 JOBS • RESPECT ${this.respect}`
        : 'NEW CAREER — NO SAVE YET';
    }
  }
  hideMenu() {
    document.getElementById('menu').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
  }
  startGame(continueSave) {
    this.sound.ensure();
    if (!continueSave) {
      this.money = 1250; this.respect = 0; this.story.reset(); this.errands.reset();
      this.garage = { engine: 0, armor: 0, nitro: 0 };
      this.takenPacks = new Set();
      for (const m of this.packMeshes) m.visible = true;
      this.clockMin = 18 * 60 + 20;
    }
    this.hideMenu();
    this.mode = 'playing';
    this.health = 100; this.armor = 50;
    this.placeOnFoot(-160, -160, 0);
    this.panel.say('LM', 'LUNA MARLOWE', 'FIXER — AZURA',
      'Kai. Welcome to Azura. Ten jobs, one city, and the whole APD on the take. Start with JOB 01.', 8);
    this.hint = 'Press E near a car to steal it • T for side errands';
    this.hintTimer = 8;
  }

  placeOnFoot(x, z, heading) {
    if (this.playerRide) {
      const r = this.playerRide;
      this.parked.push(r);
      this.playerRide = null;
    }
    this.inCar = false;
    this.px = x; this.pz = z; this.heading = heading;
    this.walker.visible = true;
    this.walker.position.set(x, 0, z);
    this.walker.rotation.y = heading;
  }
  placeInRide(modelId, x, z, heading) {
    if (this.playerRide) this.playerRide.remove(this.scene);
    const ride = new Ride(this.scene, modelById(modelId), x, z, heading, false);
    this.playerRide = ride;
    this.rideModel = modelId;
    this.inCar = true;
    this.px = x; this.pz = z; this.heading = heading;
    this.walker.visible = false;
  }

  spawnWreck(x, z) {
    const wreck = new Ride(this.scene, modelById('hawk'), x, z, 0.6, false);
    wreck.condition = 0;
    wreck.mesh.rotation.z = 0.35;
    wreck.mesh.rotation.y = 0.6;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.6, 8),
      new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.9 }));
    flame.position.set(x, 2.4, z);
    this.scene.add(flame);
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.45 }));
    smoke.position.set(x, 5, z);
    this.scene.add(smoke);
    this.effects.push({ kind: 'wreck', mesh: flame, smoke, ttl: 60, x, z });
    return wreck;
  }
  spawnBlast(x, z) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.95 }));
    ball.position.set(x, 2, z);
    this.scene.add(ball);
    this.effects.push({ kind: 'blast', mesh: ball, ttl: 4, max: 4, x, z });
  }

  snapCam() {
    const back = this.inCar ? 9.5 : 6.5;
    const up = this.inCar ? 3.6 : 2.8;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    // 3/4 view: shift the camera to the side so the car's flank shows.
    const sx = Math.cos(this.heading) * 2.4, sz = -Math.sin(this.heading) * 2.4;
    this.camPos.set(this.px - fx * back + sx, up, this.pz - fz * back + sz);
    this.camLook.set(this.px + fx * 8, 1.4, this.pz + fz * 8);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  // --- Saves ---
  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: this.money, respect: this.respect, jobsDone: this.story.jobsDone,
        garage: this.garage, packs: [...this.takenPacks], clockMin: this.clockMin,
      }));
    } catch { /* storage unavailable */ }
  }
  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      this.money = s.money ?? 1250;
      this.respect = s.respect ?? 0;
      this.story.index = s.jobsDone ?? 0;
      this.garage = s.garage || { engine: 0, armor: 0, nitro: 0 };
      this.takenPacks = new Set(s.packs || []);
      this.clockMin = s.clockMin ?? 18 * 60 + 20;
      this._hasSave = true;
    } catch { /* ignore */ }
  }

  buyUpgrade(kind) {
    const lvl = this.garage[kind];
    const costs = GARAGE_COSTS[kind];
    if (lvl >= costs.length) { this.sound.denied(); return; }
    const cost = costs[lvl];
    if (this.money < cost) { this.sound.denied(); this.panel.shout('NOT ENOUGH CASH', 2); return; }
    this.money -= cost;
    this.garage[kind] = lvl + 1;
    if (kind === 'nitro') this.nitroLeft = this.garage.nitro * 2;
    this.sound.cash();
    this.panel.shout(`${kind.toUpperCase()} UPGRADED TO LEVEL ${lvl + 1}`, 2);
    this._refreshGarageOverlay();
  }
  _refreshGarageOverlay() {
    const el = document.getElementById('garageMoney');
    if (el) el.textContent = `CASH $${this.money.toLocaleString('en-US')} — ENG ${this.garage.engine}/3 • ARM ${this.garage.armor}/3 • NITRO ${this.garage.nitro}/2`;
  }
  openGarage() {
    this.garageOpen = true;
    document.getElementById('garage').style.display = 'flex';
    this._refreshGarageOverlay();
  }
  closeGarage() {
    this.garageOpen = false;
    document.getElementById('garage').style.display = 'none';
  }

  // --- Combat ---
  _shoot() {
    if (this.gun === 1) { this._punch(); return; }
    if ((this.ammo[this.gun] || 0) <= 0) { this.sound.denied(); return; }
    this.ammo[this.gun]--;
    this.sound.shot();
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2((this.keys.mouseX / window.innerWidth) * 2 - 1, -(this.keys.mouseY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, this.camera);
    const targets = [];
    for (const u of this.cops.units) targets.push({ mesh: u.ride.mesh, kind: 'cop', ref: u });
    for (const c of this.traffic.cars) targets.push({ mesh: c.mesh, kind: 'traffic', ref: c });
    for (const c of this.parked) targets.push({ mesh: c.mesh, kind: 'parked', ref: c });
    for (const p of this.walkers.list) targets.push({ mesh: p.mesh, kind: 'ped', ref: p });
    if (this.ramTarget) targets.push({ mesh: this.ramTarget.mesh, kind: 'ram', ref: this.ramTarget });
    const meshes = targets.map((t) => t.mesh);
    const hits = ray.intersectObjects(meshes, true);
    if (hits.length) {
      let obj = hits[0].object;
      while (obj && !targets.some((t) => t.mesh === obj)) obj = obj.parent;
      const t = targets.find((x) => x.mesh === obj);
      if (t) {
        if (t.kind === 'cop' || t.kind === 'ram') {
          const dead = t.ref.ride.damage(25);
          if (t.kind === 'ram') this.ramHp = t.ref.ride.condition;
          if (dead) { this.spawnBlast(t.ref.ride.x, t.ref.ride.z); t.ref.ride.remove(this.scene); }
          this.cops.heat = Math.min(100, this.cops.heat + 12);
        } else if (t.kind === 'traffic' || t.kind === 'parked') {
          const dead = t.ref.damage(25);
          if (dead) { this.spawnBlast(t.ref.x, t.ref.z); t.ref.remove(this.scene); }
          this.cops.heat = Math.min(100, this.cops.heat + 10);
        } else if (t.kind === 'ped') {
          this.walkers.list.splice(this.walkers.list.indexOf(t.ref), 1);
          this.scene.remove(t.ref.mesh);
          this.cops.heat = Math.min(100, this.cops.heat + 18);
        }
      }
    }
  }
  _punch() {
    this.sound.blip(200, 0.08);
    for (const p of [...this.walkers.list]) {
      if (dist2(this.px, this.pz, p.x, p.z) < 2.6) {
        this.walkers.list.splice(this.walkers.list.indexOf(p), 1);
        this.scene.remove(p.mesh);
        this.cops.heat = Math.min(100, this.cops.heat + 14);
        return;
      }
    }
  }

  // --- Skills ---
  _useSkill(i) {
    const s = this.skills[i];
    if (!s || !s.ready) { this.sound.denied(); return; }
    if (s.name === 'SWAP PLATES') {
      this.cops.wanted = Math.max(0, this.cops.wanted - 1);
      this.cops.heat = Math.max(0, this.cops.heat - 30);
      this.panel.shout('PLATES SWAPPED — HEAT DROPPED', 2);
    } else if (s.name === 'QUICK FIX') {
      if (this.playerRide) this.playerRide.condition = Math.min(100, this.playerRide.condition + 40);
      this.health = Math.min(100, this.health + 25);
      this.panel.shout('QUICK FIX — PATCHED UP', 2);
    } else if (s.name === 'EYES OUT') {
      this.eyesOut = 12;
      this.panel.shout('EYES OUT — COPS MARKED ON THE MAP', 2);
    }
    s.ready = false; s.cd = s.max;
    this.sound.blip(980, 0.08);
  }

  // --- Main loop ---
  start() {
    if (shot) {
      stageShot(this, shot);
      // Paint the staged frame a few times, then signal readiness.
      let frames = 0;
      const paint = () => {
        this._refreshHud(0);
        this.renderer.render(this.scene, this.camera);
        frames++;
        if (frames < 3) requestAnimationFrame(paint);
        else window.__shotReady = true;
      };
      requestAnimationFrame(paint);
      return;
    }
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!this.paused) this.update(dt);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  update(dt) {
    this.time += dt;
    const k = this.keys;
    // Pause.
    if (k.tapped('KeyP')) {
      this.paused = !this.paused;
      this.panel.shout(this.paused ? 'PAUSED — PRESS P TO RESUME' : 'RESUMED', 2);
    }
    if (this.paused) { k.endFrame(); return; }
    if (this.mode === 'busted' || this.mode === 'wasted') {
      if (k.tapped('Enter')) {
        document.getElementById('gameover').style.display = 'none';
        this.mode = 'playing';
        this.health = 100; this.armor = 50;
        this.cops.clear();
        this.placeOnFoot(-160, -160, 0);
      }
      k.endFrame();
      return;
    }
    if (this.mode !== 'playing') { k.endFrame(); return; }

    // Clock + weather.
    this.clockMin += dt * 0.5;
    if (this.clockMin >= 24 * 60) this.clockMin -= 24 * 60;
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      this.weatherTimer = 90;
      this.weather = this.weather === 'CLEAR' ? 'RAIN' : 'CLEAR';
      this.rain.visible = this.weather === 'RAIN';
    }
    // Day/night lighting: dusk is home, night dims, day brightens.
    const hour = this.clockMin / 60;
    const night = hour >= 20 || hour < 6 ? 1 : hour >= 18 ? 0.4 : 0;
    this.hemi.intensity = 1.15 - night * 0.55;
    this.sun.intensity = 1.5 - night * 0.8;

    // Skills cooldowns.
    for (const s of this.skills) {
      if (!s.ready) { s.cd -= dt; if (s.cd <= 0) { s.ready = true; s.cd = 0; } }
    }
    if (this.eyesOut > 0) this.eyesOut -= dt;
    if (this.nitroCd > 0) this.nitroCd -= dt;
    if (this.hintTimer > 0) { this.hintTimer -= dt; if (this.hintTimer <= 0) this.hint = ''; }

    // Weapon select.
    for (let i = 1; i <= 7; i++) if (k.tapped('Digit' + i)) { this.gun = i; this.panel.setGun(i); this.sound.blip(700, 0.05); }
    if (k.tapped('KeyQ')) this._useSkill(0);
    if (k.tapped('KeyR')) this._useSkill(1);
    if (k.tapped('KeyV')) this._useSkill(2);
    if (k.tapped('KeyC')) this.sound.nextStation();
    if (k.consumeClick()) this._shoot();

    // Enter / exit car.
    if (k.tapped('KeyE')) this._tryEnterExit();
    // Side errand menu.
    if (k.tapped('KeyT')) this._cycleErrand();
    // Garage.
    if (k.tapped('KeyG')) {
      if (this.garageOpen) this.closeGarage();
      else if (dist2(this.px, this.pz, -180, 250) < 14) this.openGarage();
    }
    if (this.garageOpen && k.tapped('Escape')) this.closeGarage();

    // Nitro.
    let nitro = false;
    if (k.tapped('KeyN') && this.inCar && this.nitroLeft > 0 && this.nitroCd <= 0) {
      this.nitroTimer = 2.5; this.nitroLeft--; this.nitroCd = 4;
      this.sound.blip(1200, 0.2);
    }
    if (this.nitroTimer > 0) { this.nitroTimer -= dt; nitro = true; }

    // --- Player movement ---
    if (this.inCar && this.playerRide) {
      const steer = (k.held('KeyA') || k.held('ArrowLeft') ? -1 : 0) + (k.held('KeyD') || k.held('ArrowRight') ? 1 : 0);
      const throttle = (k.held('KeyW') || k.held('ArrowUp') ? 1 : 0) + (k.held('KeyS') || k.held('ArrowDown') ? -1 : 0);
      const boost = 1 + this.garage.engine * 0.08;
      const before = this.playerRide.condition;
      const moved = this.playerRide.drive(steer * (this.cruiseShot ? 0 : 1), throttle, dt, this.colliders, nitro);
      this.playerRide.model.top = modelById(this.rideModel).top * boost;
      this.px = this.playerRide.x; this.pz = this.playerRide.z; this.heading = this.playerRide.heading;
      if (this.playerRide.condition < before - 2) this.sound.crash();
      if (this.playerRide.condition <= 0) {
        this.spawnBlast(this.px, this.pz);
        this.playerRide.remove(this.scene);
        this.playerRide = null;
        this.placeOnFoot(this.px + 3, this.pz, this.heading);
        this.cops.heat = Math.min(100, this.cops.heat + 15);
      }
      // Ram target collision (JOB 04).
      if (this.ramTarget && this.ramTarget.alive) {
        const d = dist2(this.px, this.pz, this.ramTarget.x, this.ramTarget.z);
        if (d < 4.5 && Math.abs(this.playerRide ? this.playerRide.speed : 0) > 8) {
          const dead = this.ramTarget.damage(12);
          this.ramHp = this.ramTarget.condition;
          this.sound.crash();
          if (dead) { this.spawnBlast(this.ramTarget.x, this.ramTarget.z); this.ramTarget.remove(this.scene); this.ramTarget = null; }
        }
      }
      this.sound.engine(true, Math.abs(this.playerRide ? this.playerRide.speed : 0) / 46);
    } else {
      const fwd = (k.held('KeyW') || k.held('ArrowUp') ? 1 : 0) - (k.held('KeyS') || k.held('ArrowDown') ? 1 : 0);
      const strafe = (k.held('KeyD') || k.held('ArrowRight') ? 1 : 0) - (k.held('KeyA') || k.held('ArrowLeft') ? 1 : 0);
      const sneak = k.held('ShiftLeft') || k.held('ShiftRight');
      const sprint = k.held('Space');
      const spd = sneak ? 2.2 : sprint ? 7.5 : 4.6;
      if (fwd !== 0 || strafe !== 0) {
        const moveH = this.heading + Math.atan2(strafe, fwd);
        const nx = this.px + Math.sin(moveH) * spd * dt;
        const nz = this.pz + Math.cos(moveH) * spd * dt;
        if (!hitsBox(nx, this.pz, 0.6, this.colliders)) this.px = nx;
        if (!hitsBox(this.px, nz, 0.6, this.colliders)) this.pz = nz;
        this.heading = moveH;
        this.walkSpeed = spd;
      } else this.walkSpeed = 0;
      this.walker.position.set(this.px, 0, this.pz);
      this.walker.rotation.y = this.heading;
      this.sound.engine(false, 0);
      // Pick up hidden packages on foot.
      for (let i = 0; i < PACKAGE_SPOTS.length; i++) {
        if (this.takenPacks.has(i) || !this.packMeshes[i].visible) continue;
        const [x, z] = PACKAGE_SPOTS[i];
        if (dist2(this.px, this.pz, x, z) < 2.2) {
          this.takenPacks.add(i);
          this.packMeshes[i].visible = false;
          this.money += 150;
          this.sound.pickup();
          this.panel.shout(`HIDDEN PACKAGE ${this.takenPacks.size}/12 — +$150`, 2);
        }
      }
      if (k.tapped('KeyF')) this._punch();
    }

    // Traffic, walkers, cops.
    this.traffic.update(dt);
    const danger = this.inCar ? { x: this.px, z: this.pz } : null;
    this.walkers.update(dt, danger);
    this.cops.update(dt, this.px, this.pz, this.inCar ? Math.abs(this.playerRide.speed) : this.walkSpeed, !this.inCar);
    this.sound.siren(this.cops.wanted > 0 ? dt : 0);

    // Busted / wasted.
    if (this.cops.busted > 2.5) {
      this.mode = 'busted';
      const fine = Math.min(this.money, 500);
      this.money -= fine;
      document.getElementById('gameoverTitle').textContent = 'BUSTED';
      document.getElementById('gameoverText').textContent = `APD took you in. Fine $${fine}. The city keeps moving — so do you.`;
      document.getElementById('gameover').style.display = 'flex';
      this.cops.clear();
      this.saveGame();
      k.endFrame();
      return;
    }
    if (this.health <= 0) {
      this.mode = 'wasted';
      document.getElementById('gameoverTitle').textContent = 'WASTED';
      document.getElementById('gameoverText').textContent = 'Azura is not done with you yet. Get up and take it back.';
      document.getElementById('gameover').style.display = 'flex';
      this.saveGame();
      k.endFrame();
      return;
    }
    // Slow health regen when clean.
    if (this.cops.wanted === 0 && this.health < 100) this.health = Math.min(100, this.health + dt * 2);

    // Ram target AI (JOB 04): a Solstice GT cruising away from the player.
    if (this.story.state === 'active' && this.story.job && this.story.job.stages[this.story.stage] &&
      this.story.job.stages[this.story.stage].kind === 'ram' && !this.ramTarget) {
      this.ramTarget = new Ride(this.scene, modelById('solstice'), this.px + 30, this.pz + 10, 0, false);
      this.ramHp = 100;
    }
    if (this.ramTarget) {
      const t = this.ramTarget;
      const away = Math.atan2(t.x - this.px, t.z - this.pz);
      t.heading = turnToward(t.heading, away, 1.6 * dt);
      t.drive(0, 0.8, dt, this.colliders, false);
      if (dist2(t.x, t.z, this.px, this.pz) > 260) {
        t.x = this.px + 40; t.z = this.pz + 20;
        t.mesh.position.set(t.x, 0, t.z);
      }
    }

    // Story + errands.
    const ctx = {
      px: this.px, pz: this.pz, inCar: this.inCar, carModel: this.rideModel,
      wanted: this.cops.wanted, ramTargetHp: this.ramTarget ? this.ramHp : null,
    };
    const storyEvent = this.story.update(dt, ctx);
    if (storyEvent && storyEvent.done) {
      this.money += storyEvent.reward;
      this.respect += 8;
      const d = this._districtAtPlayer();
      this.standing[d] = (this.standing[d] || 0) + 4;
      this.sound.cash();
      this.panel.shout(`JOB COMPLETE — +$${storyEvent.reward} • RESPECT +8`, 3);
      this.panel.say('LM', 'LUNA MARLOWE', 'FIXER — AZURA', this._nextJobLine(), 6);
      this.saveGame();
      if (this.ramTarget) { this.ramTarget.remove(this.scene); this.ramTarget = null; }
    } else if (storyEvent === 'failed') {
      this.panel.shout('JOB FAILED — TALK TO LUNA TO RETRY', 3);
      if (this.ramTarget) { this.ramTarget.remove(this.scene); this.ramTarget = null; }
    }
    // Keep the heat pinned during survive stages.
    if (this.story.state === 'active' && this.story.job) {
      const st = this.story.job.stages[this.story.stage];
      if (st && st.kind === 'survive') {
        this.cops.wanted = Math.max(this.cops.wanted, st.stars);
        this.cops.heat = Math.max(this.cops.heat, 88);
      }
      if (st && st.kind === 'escape' && this.story._escapeArmed === false && this.cops.wanted < st.stars) {
        this.cops.heat = Math.max(this.cops.heat, st.stars * 20);
        this.cops.wanted = st.stars;
      }
    }
    const errEvent = this.errands.update(dt, ctx);
    if (errEvent && errEvent.done) {
      this.money += errEvent.reward;
      this.respect += 3;
      this.sound.cash();
      this.panel.shout(`ERRAND DONE — +$${errEvent.reward}`, 3);
    } else if (errEvent === 'failed') {
      this.panel.shout('ERRAND FAILED', 2);
    }

    // Effects.
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.ttl -= dt;
      if (e.kind === 'blast') {
        const t = 1 - e.ttl / e.max;
        e.mesh.scale.setScalar(1 + t * 9);
        e.mesh.material.opacity = Math.max(0, 0.95 - t);
      } else if (e.kind === 'wreck') {
        e.smoke.position.y += dt * 2;
        e.smoke.material.opacity = Math.max(0.1, e.smoke.material.opacity - dt * 0.01);
        e.mesh.rotation.y += dt * 6;
      }
      if (e.ttl <= 0) {
        this.scene.remove(e.mesh);
        if (e.smoke) this.scene.remove(e.smoke);
        this.effects.splice(i, 1);
      }
    }
    // Rain follows the player.
    if (this.rain.visible) {
      this.rain.position.set(this.px, 0, this.pz);
      const pos = this.rain.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - dt * 26;
        if (y < 0) y = 45;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }

    // Errand rings.
    for (const r of this.ringMeshes) {
      const t = this.errands.target;
      const active = this.errands.active && this.errands.kind === r.kind && t;
      r.mesh.visible = !!active;
      if (active) {
        r.mesh.position.set(t[0], 0.15, t[1]);
        r.mesh.rotation.z += dt;
      }
    }

    // Camera + HUD.
    this._updateCamera(dt);
    this._refreshHud(dt);

    // Periodic save.
    this.saveTimer += dt;
    if (this.saveTimer > 20) { this.saveTimer = 0; this.saveGame(); }

    k.endFrame();
  }

  _districtAtPlayer() {
    const { districtAt } = { districtAt: (x, z) => {
      if (x > 280) return 'SUNSET DUNES';
      if (z > 260) return 'OLD HARBOR';
      if (x < 0 && z < 0) return 'MARINA CANAL';
      if (x >= 0 && z < 0) return 'PALM ROW';
      if (x < 0) return 'OLD HARBOR';
      return 'NEON WHARF';
    } };
    return districtAt(this.px, this.pz);
  }

  _nextJobLine() {
    const lines = [
      'Nice work. Next job is on the board when you are ready.',
      'Clean. The city is starting to know your name.',
      'That was smooth. Luna always pays on time.',
      'One more down. The APD is not happy — good.',
    ];
    return lines[this.story.jobsDone % lines.length];
  }

  _tryEnterExit() {
    if (this.inCar) {
      const r = this.playerRide;
      this.playerRide = null;
      this.placeOnFoot(r.x + 3, r.z + 2, r.heading);
      return;
    }
    // Parked cars first, then traffic.
    let best = null, bd = 5.5;
    for (const c of this.parked) {
      const d = dist2(this.px, this.pz, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) {
      this.parked.splice(this.parked.indexOf(best), 1);
      this._enterRide(best);
      this.cops.heat = Math.min(100, this.cops.heat + 25);
      return;
    }
    const t = this.traffic.nearest(this.px, this.pz, 6);
    if (t) {
      this.traffic.removeCar(t);
      this._enterRide(t);
      this.cops.heat = Math.min(100, this.cops.heat + 25);
    }
  }
  _enterRide(ride) {
    this.playerRide = ride;
    this.rideModel = ride.model.id;
    this.inCar = true;
    this.px = ride.x; this.pz = ride.z; this.heading = ride.heading;
    this.walker.visible = false;
    this.sound.blip(520, 0.1);
    this.hint = 'WASD drive • SPACE handbrake • N nitro • E exit • CLICK shoot';
    this.hintTimer = 5;
  }

  _cycleErrand() {
    if (this.errands.active) { this.panel.shout('FINISH THE CURRENT ERRAND FIRST', 2); return; }
    const kinds = ['race', 'taxi', 'courier', 'stunt'];
    const next = kinds[(this._errandIdx || 0) % kinds.length];
    this._errandIdx = (this._errandIdx || 0) + 1;
    const label = this.errands.start(next);
    if (label) {
      this.panel.shout(label.toUpperCase(), 3);
      this.sound.blip(880, 0.1);
    }
  }

  _updateCamera(dt) {
    const back = this.inCar ? 9.5 : 6.5;
    const up = this.inCar ? 3.6 : 2.8;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const sx = Math.cos(this.heading) * 2.4, sz = -Math.sin(this.heading) * 2.4;
    const tx = this.px - fx * back + sx, ty = up, tz = this.pz - fz * back + sz;
    const k = 1 - Math.exp(-dt * 5);
    this.camPos.x += (tx - this.camPos.x) * k;
    this.camPos.y += (ty - this.camPos.y) * k;
    this.camPos.z += (tz - this.camPos.z) * k;
    this.camLook.set(this.px + fx * 8, 1.4, this.pz + fz * 8);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  _refreshHud(dt) {
    const job = this.story.current();
    const err = this.errands.active ? {
      code: this.errands.kind.toUpperCase(),
      name: this.errands.label,
      objective: this.errands.progressText(),
      timer: this.errands.timer,
      stage: '',
      progressBar: 0,
      next: '',
    } : null;
    const goal = (() => {
      if (this.story.state === 'active' && this.story.job) {
        const st = this.story.job.stages[this.story.stage];
        if (st && st.x != null) return { x: st.x, z: st.z };
        if (st && st.kind === 'race') { const g = st.gates[this.story._gateIdx]; return g ? { x: g[0], z: g[1] } : null; }
      }
      if (this.errands.active && this.errands.target) return { x: this.errands.target[0], z: this.errands.target[1] };
      return null;
    })();
    this.panel.refresh(dt, {
      job: job ? { code: job.code, name: job.name, objective: job.objective, timer: job.timer, stage: `STAGE ${job.id} / 10`, progressBar: job.timer > 0 ? job.timer / 120 : 0, next: 'Complete the objective to unlock the next job' } : null,
      errand: err,
      clock: this.clockMin,
      money: this.money,
      wanted: this.cops.wanted,
      rank: rankFor(this.respect),
      respect: this.respect,
      dispatch: this.cops.rows(this.px, this.pz),
      standing: this.standing,
      jobsDone: this.story.jobsDone,
      health: this.health,
      armor: this.armor,
      inCar: this.inCar,
      mph: this.playerRide ? Math.abs(this.playerRide.speed) * 2.237 : 0,
      rideName: this.playerRide ? this.playerRide.model.name : '',
      cond: this.playerRide ? this.playerRide.condition : 100,
      radio: this.sound.stationName,
      garage: this.garage,
      packs: this.takenPacks.size,
      packsTotal: PACKAGE_SPOTS.length,
      skills: this.skills,
      px: this.px, pz: this.pz, heading: this.heading,
      goal,
      hint: this.hint,
    });
  }
}

// --- Bootstrap ---
const game = new AzuraGame();
window.__azura = game;
if (shot === 'menu') {
  game.showMenu();
  game.renderer.render(game.scene, game.camera);
  window.__shotReady = true;
} else {
  game.start();
}
