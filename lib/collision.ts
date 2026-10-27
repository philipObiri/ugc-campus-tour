// Shared collision geometry and solvers: walls for the walker and pedestrians, and
// rectangle/circle tests so cars, people and the visitor never overlap.
import { CAFETERIA, COMPOUND_WALLS, STUDENT_SERVICES, cladById, entrancesOf, type SmallBuilding } from "./campus";
import { exteriorSegments, frameOf, interiorWalls, liftLocal, rearFence, toWorld } from "./interiorLayout";
import { WALLED_PLOT, lane, type XZ } from "./laneGeometry";

export type Seg = { a: XZ; b: XZ; x0: number; x1: number; z0: number; z1: number };
export const toSeg = ([a, b]: [XZ, XZ]): Seg => ({
  a, b,
  x0: Math.min(a[0], b[0]) - 1, x1: Math.max(a[0], b[0]) + 1,
  z0: Math.min(a[1], b[1]) - 1, z1: Math.max(a[1], b[1]) + 1,
});

export function smallSegs(sb: SmallBuilding): [XZ, XZ][] {
  const out: [XZ, XZ][] = [];
  for (let i = 0; i < sb.pts.length; i++) {
    const a = sb.pts[i];
    const b = sb.pts[(i + 1) % sb.pts.length];
    const [d0, d1] = sb.door;
    const onEdge = (p: XZ) => Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) < 0.01;
    if (onEdge(d0) && onEdge(d1)) {
      const near = Math.hypot(d0[0] - a[0], d0[1] - a[1]) < Math.hypot(d1[0] - a[0], d1[1] - a[1]) ? [d0, d1] : [d1, d0];
      out.push([a, near[0]], [near[1], b]);
    } else out.push([a, b]);
  }
  return out;
}

let outsideCache: Seg[] | null = null;
/** Every wall you can bump into outdoors (buildings, small blocks, fence and side walls). */
export function outsideSegments() {
  if (outsideCache) return outsideCache;
  const segs: Seg[] = [];
  for (const b of lane.buildings) segs.push(...exteriorSegments(b.pts, entrancesOf(cladById.get(b.id))).map(toSeg));
  for (const sb of [CAFETERIA, STUDENT_SERVICES]) segs.push(...smallSegs(sb).map(toSeg));
  segs.push(...COMPOUND_WALLS.map(toSeg));
  for (const b of lane.buildings) {
    const spec = cladById.get(b.id);
    if (spec) segs.push(...rearFence(b.pts, spec.rear).map(toSeg));
  }
  for (let i = 0; i < WALLED_PLOT.length; i++) segs.push(toSeg([WALLED_PLOT[i], WALLED_PLOT[(i + 1) % WALLED_PLOT.length]]));
  outsideCache = segs;
  return segs;
}

const insideCache = new Map<string, Seg[]>();
/** Walls on one floor of a clad UGC building (exterior shell, room partitions, lift core / gallery rail). */
export function insideSegments(id: number, floor: number) {
  const key = `${id}:${floor}`;
  const hit = insideCache.get(key);
  if (hit) return hit;
  const spec = cladById.get(id)!;
  const b = lane.buildings.find((x) => x.id === id)!;
  const f = frameOf(b.pts);
  const fl = spec.floors[floor];
  const segs: [XZ, XZ][] = [...exteriorSegments(b.pts, floor === 0 ? entrancesOf(spec) : []), ...interiorWalls(f, fl)];
  const box = (u0: number, u1: number, v0: number, v1: number) => {
    const c = [toWorld(f, u0, v0), toWorld(f, u1, v0), toWorld(f, u1, v1), toWorld(f, u0, v1)];
    for (let i = 0; i < 4; i++) segs.push([c[i], c[(i + 1) % 4]]);
  };
  if (fl.voidBelow) box(-f.L / 2 + 3.2, f.L / 2 - 3.2, -f.W / 2 + 3.2, f.W / 2 - 3.2);
  else {
    const l = liftLocal(f);
    box(l.u - l.w / 2, l.u + l.w / 2, l.v - l.d / 2, l.v + l.d / 2);
  }
  const out = segs.map(toSeg);
  insideCache.set(key, out);
  return out;
}

/** Push a circle (x, z, r) out of every wall segment it touches. */
export function resolveCircle(x: number, z: number, segs: Seg[], r: number): [number, number] {
  for (let iter = 0; iter < 3; iter++) {
    for (const s of segs) {
      if (x < s.x0 - r || x > s.x1 + r || z < s.z0 - r || z > s.z1 + r) continue;
      const dx = s.b[0] - s.a[0];
      const dz = s.b[1] - s.a[1];
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / l2));
      const px = s.a[0] + t * dx;
      const pz = s.a[1] + t * dz;
      const d = Math.hypot(x - px, z - pz);
      if (d < r && d > 1e-6) {
        x = px + ((x - px) / d) * r;
        z = pz + ((z - pz) / d) * r;
      }
    }
  }
  return [x, z];
}

/** An oriented rectangle: centre, heading (yaw: forward = (sin, cos)), half length and half width. */
export type Box = { x: number; z: number; yaw: number; hl: number; hw: number };

/** Push a circle out of an oriented rectangle (inflated by r). Returns the corrected point, or null if clear. */
export function pushOutOfBox(x: number, z: number, r: number, b: Box): [number, number] | null {
  const fx = Math.sin(b.yaw);
  const fz = Math.cos(b.yaw);
  const rx = x - b.x;
  const rz = z - b.z;
  const f = rx * fx + rz * fz;
  const l = rx * fz - rz * fx;
  const hl = b.hl + r;
  const hw = b.hw + r;
  if (Math.abs(f) >= hl || Math.abs(l) >= hw) return null;
  const pushL = hw - Math.abs(l);
  const pushF = hl - Math.abs(f);
  if (pushL < pushF) {
    const s = Math.sign(l) || 1;
    return [x + fz * s * pushL, z - fx * s * pushL];
  }
  const s = Math.sign(f) || 1;
  return [x + fx * s * pushF, z + fz * s * pushF];
}

/** Separating-axis test for two oriented rectangles (with a small safety margin). */
export function boxesOverlap(a: Box, b: Box, margin = 0.15) {
  const axes = [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2];
  for (const ang of axes) {
    const ax = Math.sin(ang);
    const az = Math.cos(ang);
    const proj = (o: Box) => {
      const c = o.x * ax + o.z * az;
      const fx = Math.sin(o.yaw);
      const fz = Math.cos(o.yaw);
      const r = Math.abs((fx * ax + fz * az) * o.hl) + Math.abs((fz * ax - fx * az) * o.hw);
      return [c - r, c + r];
    };
    const [a0, a1] = proj(a);
    const [b0, b1] = proj(b);
    if (a1 + margin < b0 || b1 + margin < a0) return false;
  }
  return true;
}
