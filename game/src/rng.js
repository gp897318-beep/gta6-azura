// Seeded random numbers for AZURA. Deterministic per seed so screenshots
// and playtests reproduce. A tiny xorshift-style generator with helpers.
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  let b = (a ^ 0x9e3779b9) >>> 0;
  let c = (b ^ 0x85ebca6b) >>> 0;
  let d = (c ^ 0xc2b2ae35) >>> 0;
  function next() {
    const t = (a ^ (a << 11)) >>> 0;
    a = b; b = c; c = d;
    d = (d ^ (d >>> 19) ^ t ^ (t >>> 8)) >>> 0;
    return d / 4294967296;
  }
  return {
    next,
    range(lo, hi) { return lo + next() * (hi - lo); },
    int(lo, hi) { return Math.floor(lo + next() * (hi - lo + 1)); },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    chance(p) { return next() < p; },
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
// Shortest-arc interpolation between two headings.
export function turnToward(cur, target, maxStep) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (d > maxStep) d = maxStep;
  if (d < -maxStep) d = -maxStep;
  return cur + d;
}
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
