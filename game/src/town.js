// AZURA — the city. A canal-and-harbor city at golden hour: a road grid,
// beach + sea on the east, a harbor basin with piers on the south, palms,
// neon signs and lit windows. Builds the Three.js scene and returns the
// collision boxes plus the district / street lookups the HUD uses.
import { makeRng, clamp } from './rng.js';

export const DISTRICTS = ['MARINA CANAL', 'PALM ROW', 'NEON WHARF', 'OLD HARBOR', 'SUNSET DUNES'];
export const HALF = 320; // city half-size; beach/sea beyond +x, harbor beyond +z

const AVENUES = [-240, -160, -80, 0, 80, 160, 240];
const AVE_NAMES = ['Coral Ave', 'Tide St', 'Reef Blvd', 'Canal St', 'Harbor Ln', 'Palm Dr', 'Dune Way'];
const STREETS = [-240, -160, -80, 0, 80, 160, 240];
const ST_NAMES = ['Sunset Blvd', 'Neon Row', 'Anchor St', 'Marina Way', 'Lantern St', 'Gull Ave', 'Pier Rd'];

export function districtAt(x, z) {
  if (x > 280) return 'SUNSET DUNES';
  if (z > 260) return 'OLD HARBOR';
  if (x < 0 && z < 0) return 'MARINA CANAL';
  if (x >= 0 && z < 0) return 'PALM ROW';
  if (x < 0) return 'OLD HARBOR';
  return 'NEON WHARF';
}

export function streetAt(x, z) {
  let best = 1e9, name = 'Canal St';
  for (let i = 0; i < AVENUES.length; i++) {
    const d = Math.abs(x - AVENUES[i]);
    if (d < best) { best = d; name = AVE_NAMES[i]; }
  }
  for (let i = 0; i < STREETS.length; i++) {
    const d = Math.abs(z - STREETS[i]);
    if (d < best - 4) { best = d; name = ST_NAMES[i]; }
  }
  return name;
}

function windowTexture(rng, lit) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2438'; g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 12) {
    for (let x = 6; x < 58; x += 12) {
      const on = rng.next() < lit;
      g.fillStyle = on ? (rng.next() < 0.5 ? '#ffd27a' : '#9fe8ff') : '#171226';
      g.fillRect(x, y, 8, 7);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function neonTexture(word, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#0c0a18'; g.fillRect(0, 0, 256, 64);
  g.font = 'bold 34px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 18;
  g.fillStyle = color;
  g.fillText(word, 128, 34);
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  g.fillText(word, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makePalm(mat, leafMat) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), mat);
  trunk.position.y = 3.5;
  g.add(trunk);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 4.2), leafMat);
    leaf.position.y = 7.2;
    leaf.rotation.z = 0.9 + (i % 2) * 0.35;
    leaf.rotation.y = (i / 6) * Math.PI * 2;
    leaf.translateY(1.6);
    g.add(leaf);
  }
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), leafMat);
  crown.position.y = 7.1; crown.scale.y = 0.6;
  g.add(crown);
  return g;
}

export function buildTown(scene, seed) {
  const rng = makeRng(seed);
  const colliders = [];

  // --- Sky dome: gradient shader, purple top to orange horizon ---
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x5b4a8a) },
      mid: { value: new THREE.Color(0xc96a8a) },
      low: { value: new THREE.Color(0xff9a4a) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low;
      void main(){ float h = normalize(vP).y; vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.9, h)) : mix(low, mid, smoothstep(-0.05, 0.25, h)); gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), skyMat);
  scene.add(sky);

  // Sun disc + glow over the sea (east), low on the horizon.
  const sun = new THREE.Mesh(new THREE.CircleGeometry(30, 32),
    new THREE.MeshBasicMaterial({ color: 0xffc46b, fog: false }));
  sun.position.set(560, 55, -260);
  sun.lookAt(0, 55, 0);
  scene.add(sun);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(70, 32),
    new THREE.MeshBasicMaterial({ color: 0xff8a4a, fog: false, transparent: true, opacity: 0.25 }));
  glow.position.set(562, 55, -262);
  glow.lookAt(0, 55, 0);
  scene.add(glow);

  // Clouds: flat white blobs.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffe8d8, transparent: true, opacity: 0.75, fog: false });
  for (let i = 0; i < 9; i++) {
    const cl = new THREE.Mesh(new THREE.SphereGeometry(rng.range(18, 42), 10, 8), cloudMat);
    cl.position.set(rng.range(-500, 500), rng.range(120, 200), rng.range(-500, 300));
    cl.scale.y = 0.22;
    scene.add(cl);
  }

  // --- Ground, roads, beach, sea, harbor ---
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(760, 760),
    new THREE.MeshLambertMaterial({ color: 0x3a3f4a }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c86a });
  for (const x of AVENUES) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(14, 640), roadMat);
    r.rotation.x = -Math.PI / 2; r.position.set(x, 0.06, 0);
    scene.add(r);
    for (let z = -300; z <= 300; z += 24) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 9), dashMat);
      d.rotation.x = -Math.PI / 2; d.position.set(x, 0.09, z);
      scene.add(d);
    }
  }
  for (const z of STREETS) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(640, 14), roadMat);
    r.rotation.x = -Math.PI / 2; r.position.set(0, 0.06, z);
    scene.add(r);
    for (let x = -300; x <= 300; x += 24) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.7), dashMat);
      d.rotation.x = -Math.PI / 2; d.position.set(x, 0.09, z);
      scene.add(d);
    }
  }
  // Crosswalks at the central junction.
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
  for (const [cx, cz] of [[0, -14], [0, 14], [-14, 0], [14, 0]]) {
    for (let i = -3; i <= 3; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 5), crossMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(cx + (Math.abs(cx) > 0 ? 0 : i * 2.2), 0.09, cz + (Math.abs(cz) > 0 ? 0 : i * 2.2));
      scene.add(s);
    }
  }

  // Beach sand + sea (east).
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(40, 640),
    new THREE.MeshLambertMaterial({ color: 0xd9b380 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(300, 0.05, 0);
  scene.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(420, 700),
    new THREE.MeshLambertMaterial({ color: 0x1f7f9e, transparent: true, opacity: 0.92 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(530, 0.02, 0);
  scene.add(sea);
  colliders.push({ x0: 318, z0: -400, x1: 760, z1: 400 }); // sea is not drivable

  // Harbor basin (south) with piers and boats.
  const harbor = new THREE.Mesh(new THREE.PlaneGeometry(620, 90),
    new THREE.MeshLambertMaterial({ color: 0x1a6a80, transparent: true, opacity: 0.95 }));
  harbor.rotation.x = -Math.PI / 2; harbor.position.set(-20, 0.03, 310);
  scene.add(harbor);
  colliders.push({ x0: -340, z0: 266, x1: 285, z1: 360 }); // harbor water
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  for (const px of [-180, -40, 100]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 46), pierMat);
    pier.position.set(px, 0.6, 288);
    scene.add(pier);
    colliders.push({ x0: px - 5, z0: 265, x1: px + 5, z1: 311 });
  }
  const boatMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  const boatMat2 = new THREE.MeshLambertMaterial({ color: 0xff7a4a });
  for (const [bx, bz, bm] of [[-120, 300, boatMat], [40, 296, boatMat2], [180, 306, boatMat]]) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(14, 3, 6), bm);
    hull.position.set(bx, 1.5, bz);
    scene.add(hull);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4),
      new THREE.MeshLambertMaterial({ color: 0x2a3a5a }));
    cab.position.set(bx - 2, 4.5, bz);
    scene.add(cab);
  }

  // --- Buildings: fill blocks between roads. Blocks sit BETWEEN the
  // avenues/streets (centres at -200,-120,-40,40,120,200), never on a road.
  const winTex = [windowTexture(rng, 0.55), windowTexture(rng, 0.4), windowTexture(rng, 0.7)];
  for (const t of winTex) {
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 3);
  }
  const wallCols = [0x9a7a9a, 0x7a8aaa, 0xaa8a6a, 0x6a7a8a, 0xb89a7a, 0x8a6a9a];
  const neonWords = ['AZURA', 'NEON', 'HOTEL', 'CASINO', 'BAR', 'TACOS', 'PIER 9', 'CLUB'];
  const neonCols = ['#ff2e88', '#22e6ff', '#ffd166', '#3dff9e', '#ff7a4a'];
  let built = 0;
  for (let bx = -240; bx <= 160; bx += 80) {
    for (let bz = -240; bz <= 160; bz += 80) {
      // Skip blocks that are beach or harbor.
      if (bx + 80 > 280 || bz + 80 > 260) continue;
      if (rng.chance(0.18)) continue; // empty lot / plaza
      const w = rng.range(26, 46), d = rng.range(26, 46);
      const h = rng.range(12, 58);
      const cx = bx + 40 + rng.range(-6, 6);
      const cz = bz + 40 + rng.range(-6, 6);
      const mat = new THREE.MeshLambertMaterial({
        color: wallCols[built % wallCols.length],
        emissive: 0x222222,
        emissiveMap: winTex[built % winTex.length],
        map: winTex[built % winTex.length],
      });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(cx, h / 2, cz);
      scene.add(b);
      // Roof trim.
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.8, d + 1),
        new THREE.MeshLambertMaterial({ color: 0x2a2438 }));
      trim.position.set(cx, h + 0.4, cz);
      scene.add(trim);
      colliders.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 });
      // Neon sign on some buildings.
      if (rng.chance(0.45)) {
        const word = neonWords[rng.int(0, neonWords.length - 1)];
        const col = neonCols[rng.int(0, neonCols.length - 1)];
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(20, 5),
          new THREE.MeshBasicMaterial({ map: neonTexture(word, col), transparent: true }));
        sign.position.set(cx, Math.min(h - 3, 26), cz + d / 2 + 0.3);
        scene.add(sign);
      }
      built++;
    }
  }

  // --- Palms along the beach road and harbor front ---
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2a8a4a, side: THREE.DoubleSide });
  for (let z = -300; z <= 240; z += 36) {
    const p = makePalm(trunkMat, leafMat);
    p.position.set(272, 0, z + rng.range(-4, 4));
    p.rotation.y = rng.next() * Math.PI;
    scene.add(p);
  }
  for (let x = -280; x <= 260; x += 44) {
    const p = makePalm(trunkMat, leafMat);
    p.position.set(x + rng.range(-4, 4), 0, 252);
    p.rotation.y = rng.next() * Math.PI;
    scene.add(p);
  }
  // Beach umbrellas.
  const umbCols = [0xff5a7a, 0x22e6ff, 0xffd166, 0xff7a4a];
  for (let i = 0; i < 12; i++) {
    const ux = rng.range(286, 308), uz = rng.range(-280, 240);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 5),
      new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    pole.position.set(ux, 1.5, uz);
    scene.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.2, 8),
      new THREE.MeshLambertMaterial({ color: umbCols[i % umbCols.length] }));
    top.position.set(ux, 3.4, uz);
    scene.add(top);
  }

  // Street lamps along avenues.
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe8a0 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  for (const x of AVENUES) {
    for (let z = -240; z <= 240; z += 80) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 5), poleMat);
      pole.position.set(x + 8, 3, z);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lampMat);
      bulb.position.set(x + 8, 6.2, z);
      scene.add(bulb);
    }
  }

  return { colliders, built };
}
