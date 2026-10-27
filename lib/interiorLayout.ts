// Room layout inside the clad UGC buildings, shared by the renderer and walk-mode collision.
import type { Entrance, Face, Floor, Room } from "./campus";
import { distToSeg, obb, pointInPoly, type XZ } from "./laneGeometry";

export type Frame = { cx: number; cz: number; ca: number; sa: number; L: number; W: number; pts: XZ[] };

export function frameOf(pts: XZ[]): Frame {
  const b = obb(pts);
  return { cx: b.cx, cz: b.cz, ca: Math.cos(b.angle), sa: Math.sin(b.angle), L: b.L, W: b.W, pts };
}

export const toWorld = (f: Frame, u: number, v: number): XZ => [f.cx + u * f.ca - v * f.sa, f.cz + u * f.sa + v * f.ca];

export function insideFrame(f: Frame, u: number, v: number, inset = 0.4) {
  const [x, z] = toWorld(f, u, v);
  if (!pointInPoly(x, z, f.pts)) return false;
  if (inset <= 0) return true;
  for (const [du, dv] of [[inset, 0], [-inset, 0], [0, inset], [0, -inset]]) {
    const [x2, z2] = toWorld(f, u + du, v + dv);
    if (!pointInPoly(x2, z2, f.pts)) return false;
  }
  return true;
}

export type Rect = { u0: number; u1: number; v0: number; v1: number; outerV: number };
export type RoomSlot = { room: Room; rect: Rect; center: XZ };

export const CORRIDOR = 1.3;

export function layoutFloor(f: Frame, floor: Floor) {
  const rooms = floor.rooms;
  const hasFull = rooms.some((r) => r.band === "full");
  const slots: RoomSlot[] = [];
  const bands: ("a" | "b" | "full")[] = hasFull ? ["full"] : ["a", "b"];
  for (const band of bands) {
    const list = rooms.filter((r) => r.band === band);
    const total = list.reduce((a, r) => a + r.share, 0) || 1;
    const v0 = band === "b" ? CORRIDOR : -f.W / 2;
    const v1 = band === "a" ? -CORRIDOR : f.W / 2;
    const outerV = band === "b" ? f.W / 2 : -f.W / 2;
    let u = -f.L / 2;
    for (const room of list) {
      const len = (room.share / total) * f.L;
      slots.push({ room, rect: { u0: u, u1: u + len, v0, v1, outerV }, center: toWorld(f, u + len / 2, (v0 + v1) / 2) });
      u += len;
    }
  }
  return { slots, hasFull };
}

/** Lift & stair core position (local u, v) — at the far end of the corridor. */
export const liftLocal = (f: Frame) => ({ u: f.L / 2 - 2.4, v: 0, w: 2.4, d: Math.max(1.8, CORRIDOR * 2 - 0.3) });
/** Where you stand when the lift doors open. */
export const liftLanding = (f: Frame) => {
  const l = liftLocal(f);
  const [x, z] = toWorld(f, l.u - l.w / 2 - 1.2, 0);
  return { x, z, yaw: Math.atan2(-f.ca, -f.sa) };
};

/**
 * Interior wall segments for a floor (corridor walls with a door into every room, and partitions
 * between rooms), clipped to the real footprint. Returned as continuous world-space segments.
 */
export function interiorWalls(f: Frame, floor: Floor) {
  const { slots, hasFull } = layoutFloor(f, floor);
  const lines: { u0: number; v0: number; u1: number; v1: number; gaps: [number, number][] }[] = [];
  if (!hasFull) {
    for (const side of [-1, 1]) {
      const band = side < 0 ? "a" : "b";
      const gaps = slots
        .filter((s) => s.room.band === band)
        .map((s) => {
          const mid = (s.rect.u0 + s.rect.u1) / 2 + f.L / 2;
          return [mid - 0.65, mid + 0.65] as [number, number];
        });
      lines.push({ u0: -f.L / 2, v0: side * CORRIDOR, u1: f.L / 2, v1: side * CORRIDOR, gaps });
    }
  }
  for (const s of slots) {
    if (s.rect.u0 <= -f.L / 2 + 0.1) continue;
    // full-width rooms get a doorway in the partition so you can walk between them
    const gaps: [number, number][] = hasFull ? [[Math.abs(s.rect.v1 - s.rect.v0) / 2 - 0.7, Math.abs(s.rect.v1 - s.rect.v0) / 2 + 0.7]] : [];
    lines.push({ u0: s.rect.u0, v0: s.rect.v0, u1: s.rect.u0, v1: s.rect.v1, gaps });
  }
  const segs: [XZ, XZ][] = [];
  for (const ln of lines) {
    const len = Math.hypot(ln.u1 - ln.u0, ln.v1 - ln.v0);
    const n = Math.max(1, Math.ceil(len / 0.5));
    let run: [number, number] | null = null;
    const flush = () => {
      if (!run) return;
      const [t0, t1] = run;
      segs.push([toWorld(f, ln.u0 + (ln.u1 - ln.u0) * t0, ln.v0 + (ln.v1 - ln.v0) * t0), toWorld(f, ln.u0 + (ln.u1 - ln.u0) * t1, ln.v0 + (ln.v1 - ln.v0) * t1)]);
      run = null;
    };
    for (let i = 0; i < n; i++) {
      const tm = (i + 0.5) / n;
      const d = tm * len;
      const u = ln.u0 + (ln.u1 - ln.u0) * tm;
      const v = ln.v0 + (ln.v1 - ln.v0) * tm;
      const keep = !ln.gaps.some(([g0, g1]) => d > g0 && d < g1) && insideFrame(f, u, v, 0);
      if (keep) run = run ? [run[0], (i + 1) / n] : [i / n, (i + 1) / n];
      else flush();
    }
    flush();
  }
  return segs;
}

/** The longest edge facing `face` — used for the entrance and sign. */
export function frontEdge(pts: XZ[], face: Face = "south", near?: XZ) {
  let best = { i: 0, len: 0, a: pts[0], b: pts[1], nx: face === "east" ? 1 : face === "west" ? -1 : 0, nz: face === "south" ? 1 : face === "north" ? -1 : 0 };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let nx = (b[1] - a[1]) / len;
    let nz = -(b[0] - a[0]) / len;
    if (pointInPoly((a[0] + b[0]) / 2 + nx * 0.2, (a[1] + b[1]) / 2 + nz * 0.2, pts)) {
      nx = -nx;
      nz = -nz;
    }
    const facing = face === "south" ? nz > 0.7 : face === "north" ? nz < -0.7 : face === "east" ? nx > 0.7 : nx < -0.7;
    if (!facing || len < ENTRANCE_W + 1) continue;
    const better = near
      ? distToSeg(near[0], near[1], a, b) < (best.len ? distToSeg(near[0], near[1], best.a, best.b) : Infinity)
      : len > best.len;
    if (better) best = { i, len, a, b, nx, nz };
  }
  return best;
}

export const ENTRANCE_W = 3.2;

/**
 * Line of the palisade fence behind a building: every edge facing `face`, pushed out by `offset` metres
 * and lengthened at both ends so consecutive runs meet at the corners.
 */
export function rearFence(pts: XZ[], face: Face, offset = 1.4): [XZ, XZ][] {
  const out: [XZ, XZ][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1.5) continue;
    let nx = (b[1] - a[1]) / len;
    let nz = -(b[0] - a[0]) / len;
    if (pointInPoly((a[0] + b[0]) / 2 + nx * 0.2, (a[1] + b[1]) / 2 + nz * 0.2, pts)) {
      nx = -nx;
      nz = -nz;
    }
    const facing = face === "south" ? nz > 0.7 : face === "north" ? nz < -0.7 : face === "east" ? nx > 0.7 : nx < -0.7;
    if (!facing) continue;
    const ux = (b[0] - a[0]) / len;
    const uz = (b[1] - a[1]) / len;
    out.push([
      [a[0] + nx * offset - ux * offset, a[1] + nz * offset - uz * offset],
      [b[0] + nx * offset + ux * offset, b[1] + nz * offset + uz * offset],
    ]);
  }
  return out;
}

/** Exterior wall segments of a footprint, with an optional entrance opening on the front edge. */
export function exteriorSegments(pts: XZ[], entrances: Entrance[] = []) {
  const doorEdges = new Set(entrances.map((e) => frontEdge(pts, e.face, e.near).i));
  const segs: [XZ, XZ][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (doorEdges.has(i)) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const t0 = (len / 2 - ENTRANCE_W / 2) / len;
      const t1 = (len / 2 + ENTRANCE_W / 2) / len;
      segs.push([a, [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0]]);
      segs.push([[a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1], b]);
    } else segs.push([a, b]);
  }
  return segs;
}

export function floorRooms(f: Frame, floor: Floor) {
  return layoutFloor(f, floor).slots.filter((s) => pointInPoly(s.center[0], s.center[1], f.pts));
}
