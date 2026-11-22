// Pedestrians for AZURA: simple walkers on the sidewalks who scatter
// when a car comes fast or a shot rings out.
import { makeRng, clamp, dist2 } from './rng.js';

const SHIRTS = [0xff5a7a, 0x22e6ff, 0xffd166, 0x3dff9e, 0xff7a4a, 0xe8e8e8, 0x9a7aff];

export class Walkers {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = makeRng(seed + 31);
    this.list = [];
    for (let i = 0; i < 42; i++) this.addOne(true);
  }
  addOne(anywhere) {
    const rng = this.rng;
    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: SHIRTS[rng.int(0, SHIRTS.length - 1)] });
    const skin = new THREE.MeshLambertMaterial({ color: [0xe8b88a, 0xc98a5a, 0x8a5a3a][rng.int(0, 2)] });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x2a2a3a }));
    legs.position.y = 0.4;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.35), shirt);
    torso.position.y = 1.15;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), skin);
    head.position.y = 1.75;
    g.add(legs, torso, head);
    const x = anywhere ? rng.range(-280, 280) : 0;
    const z = anywhere ? rng.range(-280, 240) : 0;
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.list.push({
      mesh: g, x, z,
      heading: rng.next() * Math.PI * 2,
      speed: rng.range(1.2, 2.4),
      flee: 0,
    });
  }
  update(dt, danger) {
    for (const p of this.list) {
      // Flee from danger (fast car / gunfire near the player).
      if (danger && dist2(p.x, p.z, danger.x, danger.z) < 26) p.flee = 2.5;
      let spd = p.speed;
      if (p.flee > 0) { p.flee -= dt; spd = 5.5; }
      p.x += Math.sin(p.heading) * spd * dt;
      p.z += Math.cos(p.heading) * spd * dt;
      if (p.x < -300 || p.x > 300 || p.z < -300 || p.z > 250 || Math.random() < 0.004) {
        p.heading += (Math.random() - 0.5) * 2.4;
        p.x = clamp(p.x, -300, 300);
        p.z = clamp(p.z, -300, 250);
      }
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      // Simple leg-free bob.
      p.mesh.position.y = Math.abs(Math.sin(p.x * 0.4 + p.z * 0.4)) * 0.05;
    }
  }
}
