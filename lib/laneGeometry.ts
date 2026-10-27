import * as THREE from "three";
import laneData from "./lane.json";

// Real footprints & roads from OpenStreetMap (© OpenStreetMap contributors, ODbL),
// converted by scripts/build-lane.mjs into metres around the UGC pin (x = east, z = south).

export type XZ = [number, number];
export type LaneBuilding = {
  id: number; name: string | null; levels: number | null; kind: string; area: number; c: XZ; pts: XZ[];
};
export type LaneRoad = { id: number; name: string | null; kind: string; width: number; surface: string; pts: XZ[] };
export type LanePoi = { name: string; x: number; z: number; kind: string; src: string };

export const lane = laneData as unknown as { buildings: LaneBuilding[]; roads: LaneRoad[]; pois: LanePoi[] };

// Adjustments from a UGC student, checked against satellite imagery:
//  - the Main Campus extends west over the neighbouring outline, forming one larger building;
//  - the small block against the Hall's east wall is replaced by the Student Services Centre.
{
  const MAIN = 948095838;
  const main = lane.buildings.find((b) => b.id === MAIN);
  if (main) {
    main.pts = [
      [-16, -24], [3, -25], [6, -26], [21, -27], [21, -25], [42, -27], [42, -20], [45, -20], [46, -11],
      [40, -11], [40, -7], [35, -7], [35, -4], [20, -3], [19, -9], [4, -8], [-16, -7],
    ];
    let a = 0;
    for (let i = 0; i < main.pts.length; i++) {
      const p = main.pts[i];
      const q = main.pts[(i + 1) % main.pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    main.area = Math.round(Math.abs(a) / 2);
    main.c = [
      +(main.pts.reduce((t, p) => t + p[0], 0) / main.pts.length).toFixed(1),
      +(main.pts.reduce((t, p) => t + p[1], 0) / main.pts.length).toFixed(1),
    ];
  }
  const REMOVED = new Set([948095837, 1379266651]);
  lane.buildings = lane.buildings.filter((b) => !REMOVED.has(b.id));
}
export const WALLED_PLOT: XZ[] = [];

export const HALL_ACCESS_ROAD_ID = 958175795; // lane along the hall's south (front) face
export const SIDE_LANE_ID = 323902444; // north–south lane west of the hall

// Roads that carry through traffic look paved in street imagery; the residential lanes are laterite.
const PAVED = new Set(["Otu Adzin Road", "14th Street", "Spintex Road", "Asafoatse Otufio Avenue"]);
export const roadSurface = (r: LaneRoad) => (r.surface === "asphalt" || (r.name && PAVED.has(r.name)) ? "asphalt" : "laterite");

export function hash(n: number) {
  let x = Math.sin(n * 12.9898) * 43758.5453;
  x -= Math.floor(x);
  return x;
}
export function seeded(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export function pointInPoly(x: number, z: number, poly: XZ[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

export function distToSeg(px: number, pz: number, a: XZ, b: XZ) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2));
  return Math.hypot(px - a[0] - t * dx, pz - a[1] - t * dz);
}

/** Minimum-area oriented rectangle around a footprint. */
export function obb(pts: XZ[]) {
  let best = { area: Infinity, angle: 0, cx: 0, cz: 0, L: 0, W: 0 };
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    const ang = Math.atan2(bz - az, bx - ax);
    const ca = Math.cos(-ang);
    const sa = Math.sin(-ang);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of pts) {
      const u = x * ca - z * sa;
      const v = x * sa + z * ca;
      x0 = Math.min(x0, u); x1 = Math.max(x1, u); z0 = Math.min(z0, v); z1 = Math.max(z1, v);
    }
    const area = (x1 - x0) * (z1 - z0);
    if (area < best.area) {
      const mu = (x0 + x1) / 2;
      const mv = (z0 + z1) / 2;
      // rotate the centre back
      const cx = mu * Math.cos(ang) - mv * Math.sin(ang);
      const cz = mu * Math.sin(ang) + mv * Math.cos(ang);
      best = { area, angle: ang, cx, cz, L: x1 - x0, W: z1 - z0 };
    }
  }
  if (best.W > best.L) best = { ...best, angle: best.angle + Math.PI / 2, L: best.W, W: best.L };
  return best;
}

const WALLS = ["#efe7d8", "#f4efe6", "#e9d8bd", "#f1dcb8", "#e3e7e3", "#f3e5c9", "#ddd3c4", "#c98b6b", "#78b4b1", "#bfc4c8", "#f6f1e7"];
const WALL_W = [10, 10, 8, 6, 5, 6, 5, 2, 2, 3, 8];
const ROOFS = ["#7a2a22", "#8e3426", "#5b2a26", "#3e4a52", "#2f5a3f", "#2c4f7c", "#a9aeb3", "#6d3b2a", "#9a3d2b"];

function pickWeighted(r: number) {
  const total = WALL_W.reduce((a, b) => a + b, 0);
  let t = r * total;
  for (let i = 0; i < WALLS.length; i++) {
    t -= WALL_W[i];
    if (t <= 0) return WALLS[i];
  }
  return WALLS[0];
}

export type Spec = {
  levels: number; height: number; roof: "hip" | "gable" | "flat"; wall: THREE.Color; roofColor: THREE.Color;
  box: ReturnType<typeof obb>;
};

export function specFor(b: LaneBuilding): Spec {
  const r = seeded(b.id);
  r();
  const box = obb(b.pts);
  const levels = b.levels ?? (b.area > 450 ? 3 + Math.round(r()) : b.area > 220 ? 2 + Math.round(r()) : b.area > 90 ? 1 + Math.round(r()) : 1);
  const fill = b.area / (box.L * box.W);
  // Pitched roofs only on near-rectangular footprints, so no roof overhangs empty ground.
  const flat = levels >= 4 || b.area > 650 || fill < 0.93 || b.pts.length > 8 || box.W > 22 || r() < 0.18;
  return {
    levels,
    height: levels * 3.2 + 0.3,
    roof: flat ? "flat" : r() < 0.72 ? "hip" : "gable",
    wall: new THREE.Color(pickWeighted(r())),
    roofColor: new THREE.Color(ROOFS[Math.floor(r() * ROOFS.length)]),
    box,
  };
}

/** Accumulates triangles with explicit normals, UVs, colours and a per-triangle owner index. */
export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  owner: number[] = [];

  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ua: number[], ub: number[], uc: number[], color: THREE.Color, owner = -1, n?: THREE.Vector3) {
    const normal = n ?? new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const [p, u] of [[a, ua], [b, ub], [c, uc]] as const) {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(normal.x, normal.y, normal.z);
      this.uv.push(u[0], u[1]);
      this.col.push(color.r, color.g, color.b);
    }
    this.owner.push(owner);
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ua: number[], ub: number[], uc: number[], ud: number[], color: THREE.Color, owner = -1, n?: THREE.Vector3) {
    this.tri(a, b, c, ua, ub, uc, color, owner, n);
    this.tri(a, c, d, ua, uc, ud, color, owner, n);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Outward-facing walls along the real footprint. UV: u = bays (3 m), v = floors (3.2 m). */
export function addWalls(gb: GeoBuilder, pts: XZ[], y0: number, y1: number, color: THREE.Color, owner: number, bay = 3, floor = 3.2) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    let nx = (bz - az) / len;
    let nz = -(bx - ax) / len;
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    if (pointInPoly(mx + nx * 0.2, mz + nz * 0.2, pts)) {
      nx = -nx;
      nz = -nz;
    }
    const n = V(nx, 0, nz);
    const u0 = s / bay;
    const u1 = (s + len) / bay;
    gb.quad(V(ax, y0, az), V(bx, y0, bz), V(bx, y1, bz), V(ax, y1, az), [u0, y0 / floor], [u1, y0 / floor], [u1, y1 / floor], [u0, y1 / floor], color, owner, n);
    s += len;
  }
}

export function addFlatCap(gb: GeoBuilder, pts: XZ[], y: number, color: THREE.Color, owner: number) {
  const contour = pts.map(([x, z]) => new THREE.Vector2(x, z));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const up = V(0, 1, 0);
  for (const [i, j, k] of tris) {
    const a = pts[i];
    const b = pts[j];
    const c = pts[k];
    gb.tri(V(a[0], y, a[1]), V(b[0], y, b[1]), V(c[0], y, c[1]), [a[0] / 4, a[1] / 4], [b[0] / 4, b[1] / 4], [c[0] / 4, c[1] / 4], color, owner, up);
  }
}

/**
 * Corrugated long-span roof over the oriented box (hip or gable), with eaves overhang,
 * fascia boards and a ridge cap. UV u runs along the eave (ribs run downslope).
 */
export function addPitchedRoof(
  roof: GeoBuilder, plain: GeoBuilder, spec: Spec, owner: number, fasciaColor: THREE.Color, ridgeColor: THREE.Color,
) {
  const { box } = spec;
  const eave = 0.7;
  const L = box.L + eave * 2;
  const W = box.W + eave * 2;
  const pitch = THREE.MathUtils.degToRad(spec.roof === "hip" ? 22 : 20);
  const h = (W / 2) * Math.tan(pitch);
  const y = spec.height - 0.15;
  const ca = Math.cos(box.angle);
  const sa = Math.sin(box.angle);
  const P = (u: number, v: number, yy: number) => V(box.cx + u * ca - v * sa, yy, box.cz + u * sa + v * ca);
  const slope = Math.hypot(W / 2, h);
  const rib = 0.9;
  const hip = spec.roof === "hip";
  const rx = hip ? (L - W) / 2 : L / 2;

  const A = P(-L / 2, -W / 2, y), B = P(L / 2, -W / 2, y), C = P(L / 2, W / 2, y), D = P(-L / 2, W / 2, y);
  const R1 = P(-rx, 0, y + h), R2 = P(rx, 0, y + h);
  const col = spec.roofColor;
  // long slopes
  roof.quad(A, R1, R2, B, [-L / 2 / rib, 0], [-rx / rib, slope], [rx / rib, slope], [L / 2 / rib, 0], col, owner);
  roof.quad(C, R2, R1, D, [L / 2 / rib, 0], [rx / rib, slope], [-rx / rib, slope], [-L / 2 / rib, 0], col, owner);
  const fixUp = (n: THREE.Vector3) => (n.y < 0 ? n.negate() : n);
  if (hip) {
    const endSlope = Math.hypot((L - (L - W)) / 2, h);
    const n1 = fixUp(new THREE.Vector3().subVectors(C, B).cross(new THREE.Vector3().subVectors(R2, B)).normalize());
    roof.tri(B, R2, C, [-W / 2 / rib, 0], [0, endSlope], [W / 2 / rib, 0], col, owner, n1);
    const n2 = fixUp(new THREE.Vector3().subVectors(A, D).cross(new THREE.Vector3().subVectors(R1, D)).normalize());
    roof.tri(D, R1, A, [-W / 2 / rib, 0], [0, endSlope], [W / 2 / rib, 0], col, owner, n2);
  } else {
    // gable ends are wall-coloured
    const g1 = P(L / 2 - eave, -W / 2 + eave, y), g2 = P(L / 2 - eave, W / 2 - eave, y), g3 = P(L / 2 - eave, 0, y + h * ((W / 2 - eave) / (W / 2)));
    plain.tri(g1, g3, g2, [0, 0], [0, 0], [0, 0], spec.wall, owner, V(ca, 0, sa));
    const g4 = P(-L / 2 + eave, W / 2 - eave, y), g5 = P(-L / 2 + eave, -W / 2 + eave, y), g6 = P(-L / 2 + eave, 0, y + h * ((W / 2 - eave) / (W / 2)));
    plain.tri(g4, g6, g5, [0, 0], [0, 0], [0, 0], spec.wall, owner, V(-ca, 0, -sa));
  }
  // fascia boards around the eaves
  const f = 0.28;
  const edges: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
    [A, B, V(sa, 0, -ca)], [B, C, V(ca, 0, sa)], [C, D, V(-sa, 0, ca)], [D, A, V(-ca, 0, -sa)],
  ];
  for (const [p, q, n] of edges) {
    plain.quad(V(p.x, p.y - f, p.z), V(q.x, q.y - f, q.z), V(q.x, q.y + 0.04, q.z), V(p.x, p.y + 0.04, p.z), [0, 0], [0, 0], [0, 0], [0, 0], fasciaColor, owner, n);
  }
  // ridge cap
  const w = 0.22;
  const r1a = P(-rx, -w, y + h - 0.06), r2a = P(rx, -w, y + h - 0.06);
  const r1b = P(-rx, w, y + h - 0.06), r2b = P(rx, w, y + h - 0.06);
  const t1 = P(-rx, 0, y + h + 0.1), t2 = P(rx, 0, y + h + 0.1);
  plain.quad(r1a, t1, t2, r2a, [0, 0], [0, 0], [0, 0], [0, 0], ridgeColor, owner);
  plain.quad(r2b, t2, t1, r1b, [0, 0], [0, 0], [0, 0], [0, 0], ridgeColor, owner);
}

/** Flat ribbon along a polyline, with round joints so segments don't gap. */
export function addRibbon(gb: GeoBuilder, pts: XZ[], width: number, y: number, color: THREE.Color, owner = -1, offset = 0) {
  const up = V(0, 1, 0);
  const hw = width / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.01) continue;
    const nx = -(bz - az) / len;
    const nz = (bx - ax) / len;
    const ox = nx * offset;
    const oz = nz * offset;
    const a1 = V(ax + ox + nx * hw, y, az + oz + nz * hw), a2 = V(ax + ox - nx * hw, y, az + oz - nz * hw);
    const b1 = V(bx + ox + nx * hw, y, bz + oz + nz * hw), b2 = V(bx + ox - nx * hw, y, bz + oz - nz * hw);
    gb.quad(a2, a1, b1, b2, [ax / 5, az / 5], [ax / 5 + 0.2, az / 5], [bx / 5 + 0.2, bz / 5], [bx / 5, bz / 5], color, owner, up);
  }
  if (offset === 0) {
    for (const [x, z] of pts) {
      const seg = 10;
      for (let k = 0; k < seg; k++) {
        const t0 = (k / seg) * Math.PI * 2;
        const t1 = ((k + 1) / seg) * Math.PI * 2;
        gb.tri(V(x, y, z), V(x + Math.cos(t1) * hw, y, z + Math.sin(t1) * hw), V(x + Math.cos(t0) * hw, y, z + Math.sin(t0) * hw), [x / 5, z / 5], [x / 5, z / 5], [x / 5, z / 5], color, owner, up);
      }
    }
  }
}

/** Point and heading at distance d along a polyline (ping-pongs past the ends). */
export function alongPath(pts: XZ[], lengths: number[], total: number, d: number, out: THREE.Vector3) {
  const period = total * 2;
  let t = ((d % period) + period) % period;
  let dir = 1;
  if (t > total) {
    t = period - t;
    dir = -1;
  }
  for (let i = 0; i < lengths.length; i++) {
    if (t <= lengths[i] || i === lengths.length - 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const f = Math.min(1, t / (lengths[i] || 1));
      out.set(a[0] + (b[0] - a[0]) * f, 0, a[1] + (b[1] - a[1]) * f);
      const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      return dir > 0 ? yaw : yaw + Math.PI;
    }
    t -= lengths[i];
  }
  return 0;
}

export function pathLengths(pts: XZ[]) {
  const lengths = pts.slice(0, -1).map((p, i) => Math.hypot(pts[i + 1][0] - p[0], pts[i + 1][1] - p[1]));
  return { lengths, total: lengths.reduce((a, b) => a + b, 0) };
}
