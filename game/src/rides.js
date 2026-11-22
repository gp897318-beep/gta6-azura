// Cars for AZURA: models, meshes, arcade driving and city traffic.
// Every model is a box-built low-poly car; the police variants get a
// light bar. Traffic cars follow the road grid on simple loops.
import { makeRng, clamp, turnToward, dist2 } from './rng.js';

export const RIDE_MODELS = [
  { id: 'solstice', name: 'SOLSTICE GT', color: 0xe8384f, top: 46, accel: 26, grip: 2.6 },
  { id: 'tidal', name: 'TIDAL S', color: 0x2a9ad8, top: 42, accel: 24, grip: 2.4 },
  { id: 'sprinter', name: 'PALM SPRINTER', color: 0xffd23a, top: 40, accel: 22, grip: 2.3 },
  { id: 'hawk', name: 'HARBOR HAWK', color: 0x3a3f4a, top: 44, accel: 25, grip: 2.5 },
  { id: 'falcon', name: 'NEON FALCON', color: 0xff7a4a, top: 48, accel: 28, grip: 2.7 },
  { id: 'star', name: 'AZURA STAR', color: 0xe8e8e8, top: 38, accel: 20, grip: 2.2 },
  { id: 'reef', name: 'REEF RUNNER', color: 0x2ad89a, top: 41, accel: 23, grip: 2.4 },
  { id: 'taxi', name: 'PALM TAXI', color: 0xffc41e, top: 36, accel: 19, grip: 2.1 },
];

export function modelById(id) {
  return RIDE_MODELS.find((m) => m.id === id) || RIDE_MODELS[0];
}

// Build a low-poly car mesh. `cop` adds a light bar and a black/white body.
export function buildRideMesh(model, cop) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: cop ? 0xf2f2f2 : model.color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14141c });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.62;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), glass);
  cabin.position.set(0, 1.18, -0.25);
  g.add(cabin);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.4, 0.5), paint);
  nose.position.set(0, 0.55, 2.35);
  g.add(nose);
  // Headlights / taillights.
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const sx of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), hl);
    h.position.set(sx, 0.68, 2.62);
    g.add(h);
  }
  const tl = new THREE.MeshBasicMaterial({ color: 0xff2a3a });
  for (const sx of [-0.65, 0.65]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), tl);
    t.position.set(sx, 0.68, -2.24);
    g.add(t);
  }
  if (cop) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.55, -0.2);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.set(-0.32, 1.7, -0.2);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2050ff }));
    blue.position.set(0.32, 1.7, -0.2);
    g.add(blue);
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.4, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x1a1a22 }));
    door.position.set(0, 0.62, 0.2);
    g.add(door);
  } else if (model.top >= 46) {
    // Spoiler for the fast ones.
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.45), dark);
    wing.position.set(0, 1.15, -2.1);
    g.add(wing);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}

// A drivable car: arcade physics, AABB collision, damage.
export class Ride {
  constructor(scene, model, x, z, heading, cop) {
    this.model = model;
    this.mesh = buildRideMesh(model, cop);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0; // m/s, forward positive
    this.condition = 100;
    this.cop = !!cop;
    this.alive = true;
  }
  get pos() { return { x: this.x, z: this.z }; }
  // steer: -1..1, throttle: -1..1, dt seconds. Returns distance moved.
  drive(steer, throttle, dt, colliders, nitro) {
    const m = this.model;
    const top = m.top * (nitro ? 1.35 : 1);
    const acc = m.accel * (nitro ? 1.5 : 1);
    if (throttle > 0) this.speed += acc * throttle * dt;
    else if (throttle < 0) this.speed += acc * throttle * 0.7 * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 9 * dt);
    if (this.speed > top) this.speed = top;
    if (this.speed < -12) this.speed = -12;
    const spd = Math.abs(this.speed);
    const turn = steer * m.grip * (spd / (spd + 14)) * dt * (this.speed < 0 ? -1 : 1);
    this.heading += turn;
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    // AABB collision: slide along the blocked axis.
    if (!hitsBox(nx, this.z, 1.3, colliders)) this.x = nx;
    else { this.speed *= 0.55; this.condition = Math.max(0, this.condition - spd * 0.12); }
    if (!hitsBox(this.x, nz, 1.3, colliders)) this.z = nz;
    else { this.speed *= 0.55; this.condition = Math.max(0, this.condition - spd * 0.12); }
    // World bounds.
    this.x = clamp(this.x, -330, 312);
    this.z = clamp(this.z, -330, 262);
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const spin = this.speed * dt * 2.2;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    return spd * dt;
  }
  damage(amount) {
    this.condition = Math.max(0, this.condition - amount);
    return this.condition <= 0;
  }
  remove(scene) { scene.remove(this.mesh); this.alive = false; }
}

export function hitsBox(x, z, r, colliders) {
  for (const c of colliders) {
    if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return true;
  }
  return false;
}

// Ambient traffic: cars cruising the grid on straight lanes.
export class Traffic {
  constructor(scene, seed, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = makeRng(seed + 77);
    this.cars = [];
    const avenues = [-240, -160, -80, 0, 80, 160, 240];
    for (let i = 0; i < 22; i++) this.spawn(avenues);
  }
  spawn(avenues) {
    const rng = this.rng;
    const vertical = rng.chance(0.5);
    const lane = avenues[rng.int(0, avenues.length - 1)];
    const along = rng.range(-300, 300);
    const model = RIDE_MODELS[rng.int(0, RIDE_MODELS.length - 1)];
    const x = vertical ? lane + (rng.chance(0.5) ? 3.5 : -3.5) : along;
    const z = vertical ? along : lane + (rng.chance(0.5) ? 3.5 : -3.5);
    const heading = vertical ? (along > 0 ? Math.PI : 0) : (along > 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = new Ride(this.scene, model, x, z, heading, false);
    car.speed = rng.range(9, 15);
    car.cruise = car.speed;
    this.cars.push(car);
  }
  update(dt) {
    for (const car of this.cars) {
      // Cruise straight; wrap around at the city edge.
      car.speed = car.cruise;
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      if (nx < -320 || nx > 310 || nz < -320 || nz > 260) {
        car.remove(this.scene);
        const i = this.cars.indexOf(car);
        if (i >= 0) this.cars.splice(i, 1);
        this.spawn([-240, -160, -80, 0, 80, 160, 240]);
        continue;
      }
      car.x = nx; car.z = nz;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
    }
  }
  // Nearest traffic car within range of a point (for stealing).
  nearest(x, z, range) {
    let best = null, bd = range;
    for (const c of this.cars) {
      const d = dist2(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  removeCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    car.remove(this.scene);
    this.spawn([-240, -160, -80, 0, 80, 160, 240]);
  }
}
