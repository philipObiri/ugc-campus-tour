"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CAFETERIA, CLAD, COMPOUND_WALLS, STUDENT_SERVICES, cladById, floorBase, type SmallBuilding } from "@/lib/campus";
import { exteriorSegments, frameOf, interiorWalls, liftLocal, toWorld } from "@/lib/interiorLayout";
import { WALLED_PLOT, lane, pointInPoly, type XZ } from "@/lib/laneGeometry";
import { WALKER } from "./Life";

export type WalkState = { x: number; z: number; yaw: number; pitch: number; building: number | null; floor: number };

const EYE = 1.65;
const RADIUS = 0.32;

function smallSegs(sb: SmallBuilding): [XZ, XZ][] {
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

type Seg = { a: XZ; b: XZ; x0: number; x1: number; z0: number; z1: number };
const toSeg = ([a, b]: [XZ, XZ]): Seg => ({ a, b, x0: Math.min(a[0], b[0]) - 1, x1: Math.max(a[0], b[0]) + 1, z0: Math.min(a[1], b[1]) - 1, z1: Math.max(a[1], b[1]) + 1 });

/** Collision walls for the outdoors, or for one floor of a clad building. */
export function useCollision() {
  return useMemo(() => {
    const outside: Seg[] = [];
    for (const b of lane.buildings) outside.push(...exteriorSegments(b.pts, cladById.has(b.id), cladById.get(b.id)?.face).map(toSeg));
    for (const sb of [CAFETERIA, STUDENT_SERVICES]) outside.push(...smallSegs(sb).map(toSeg));
    outside.push(...COMPOUND_WALLS.map(toSeg));
    for (let i = 0; i < WALLED_PLOT.length; i++) outside.push(toSeg([WALLED_PLOT[i], WALLED_PLOT[(i + 1) % WALLED_PLOT.length]]));
    const cache = new Map<string, Seg[]>();
    const insideFor = (id: number, floor: number) => {
      const key = `${id}:${floor}`;
      if (cache.has(key)) return cache.get(key)!;
      const spec = cladById.get(id)!;
      const b = lane.buildings.find((x) => x.id === id)!;
      const f = frameOf(b.pts);
      const fl = spec.floors[floor];
      const segs: [XZ, XZ][] = [...exteriorSegments(b.pts, floor === 0, spec.face), ...interiorWalls(f, fl)];
      if (fl.voidBelow) {
        // gallery railing around the opening
        const u0 = -f.L / 2 + 3.2, u1 = f.L / 2 - 3.2, v0 = -f.W / 2 + 3.2, v1 = f.W / 2 - 3.2;
        const c = [toWorld(f, u0, v0), toWorld(f, u1, v0), toWorld(f, u1, v1), toWorld(f, u0, v1)];
        for (let i = 0; i < 4; i++) segs.push([c[i], c[(i + 1) % 4]]);
      } else {
        const l = liftLocal(f);
        const c = [toWorld(f, l.u - l.w / 2, l.v - l.d / 2), toWorld(f, l.u + l.w / 2, l.v - l.d / 2), toWorld(f, l.u + l.w / 2, l.v + l.d / 2), toWorld(f, l.u - l.w / 2, l.v + l.d / 2)];
        for (let i = 0; i < 4; i++) segs.push([c[i], c[(i + 1) % 4]]);
      }
      const out = segs.map(toSeg);
      cache.set(key, out);
      return out;
    };
    return { outside, insideFor };
  }, []);
}

function resolve(x: number, z: number, segs: Seg[]) {
  for (let iter = 0; iter < 3; iter++) {
    for (const s of segs) {
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      const dx = s.b[0] - s.a[0];
      const dz = s.b[1] - s.a[1];
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / l2));
      const px = s.a[0] + t * dx;
      const pz = s.a[1] + t * dz;
      const d = Math.hypot(x - px, z - pz);
      if (d < RADIUS && d > 1e-6) {
        x = px + ((x - px) / d) * RADIUS;
        z = pz + ((z - pz) / d) * RADIUS;
      }
    }
  }
  return [x, z] as const;
}

/**
 * First-person walking. Keyboard: WASD / arrows to move, Q/E to turn, Shift to run.
 * Mouse: drag to look, scroll to walk forward/back (sideways swipe to step aside),
 * click a spot on the ground to walk there.
 */
export function WalkController({ state, onEnterExit }: { state: React.RefObject<WalkState>; onEnterExit: (building: number | null) => void }) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null);
  const wheel = useRef({ fwd: 0, side: 0 }); // walking impulse from the scroll wheel, decays over time
  const goal = useRef<{ x: number; z: number } | null>(null); // click-to-walk destination
  const hover = useRef({ x: 0, y: 0, on: false }); // cursor position over the view, -1..1
  const look = useRef({ yaw: 0, pitch: 0 }); // head turn that follows the cursor
  const bob = useRef(0);
  const col = useCollision();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
      keys.current.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const el = gl.domElement;
    const pd = (e: PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY, moved: 0 };
      el.setPointerCapture?.(e.pointerId); // keep turning even if the pointer leaves the canvas
    };
    const pm = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      hover.current = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1, on: inside && e.pointerType === "mouse" };
      if (!drag.current) return;
      const s = state.current;
      // ~720 px of drag turns you all the way round; look almost straight up or down
      s.yaw -= (e.clientX - drag.current.x) * 0.0085;
      s.pitch = THREE.MathUtils.clamp(s.pitch - (e.clientY - drag.current.y) * 0.0065, -1.45, 1.45);
      drag.current = { x: e.clientX, y: e.clientY, moved: drag.current.moved + Math.abs(e.movementX) + Math.abs(e.movementY) };
    };
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ray = new THREE.Raycaster();
    const pu = (e: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      // a click without dragging = walk to the clicked spot on the floor
      if (!d || d.moved > 6) return;
      const r = el.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const s = state.current;
      ground.constant = -(s.building != null ? floorBase(s.floor) : 0);
      const hit = new THREE.Vector3();
      if (ray.ray.intersectPlane(ground, hit) && Math.hypot(hit.x - s.x, hit.z - s.z) < 60) goal.current = { x: hit.x, z: hit.z };
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // scroll up = forward, down = back; horizontal swipe = step sideways
      wheel.current.fwd = THREE.MathUtils.clamp(wheel.current.fwd - e.deltaY * 0.004, -1.6, 1.6);
      wheel.current.side = THREE.MathUtils.clamp(wheel.current.side + e.deltaX * 0.004, -1.2, 1.2);
      goal.current = null;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    const leave = () => (hover.current.on = false);
    el.addEventListener("pointerleave", leave);
    el.style.touchAction = "none"; // let touch swipes turn the view instead of scrolling the page
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    el.addEventListener("pointerdown", pd);
    window.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      el.removeEventListener("pointerdown", pd);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerleave", leave);
      window.removeEventListener("pointermove", pm);
      window.removeEventListener("pointerup", pu);
      WALKER.active = false;
    };
  }, [gl, state, camera]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = state.current;
    const k = keys.current;
    const keyFwd = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
    const keySide = (k.has("d") ? 1 : 0) - (k.has("a") ? 1 : 0);
    const turn = (k.has("arrowleft") || k.has("q") ? 1 : 0) - (k.has("arrowright") || k.has("e") ? 1 : 0);
    if (keyFwd || keySide || turn) goal.current = null;
    s.yaw += turn * dt * 2.2;
    // moving the mouse turns your head toward it; near the left/right edge you keep turning
    const h = hover.current;
    const lookYaw = h.on && !goal.current ? -h.x * 0.75 : 0;
    const lookPitch = h.on && !goal.current ? -h.y * 0.4 : 0;
    look.current.yaw = THREE.MathUtils.damp(look.current.yaw, lookYaw, 4, dt);
    look.current.pitch = THREE.MathUtils.damp(look.current.pitch, lookPitch, 4, dt);
    if (h.on && !drag.current && Math.abs(h.x) > 0.82) s.yaw -= Math.sign(h.x) * dt * 1.6 * ((Math.abs(h.x) - 0.82) / 0.18);
    // scroll-wheel walking eases out, like letting go of a key
    const w = wheel.current;
    w.fwd = THREE.MathUtils.damp(w.fwd, 0, 3.5, dt);
    w.side = THREE.MathUtils.damp(w.side, 0, 3.5, dt);
    let fwd = THREE.MathUtils.clamp(keyFwd + w.fwd, -1, 1);
    let side = THREE.MathUtils.clamp(keySide + w.side, -1, 1);
    // click-to-walk: turn toward the goal and head there
    if (goal.current) {
      const gx = goal.current.x - s.x;
      const gz = goal.current.z - s.z;
      const dist = Math.hypot(gx, gz);
      if (dist < 0.4) goal.current = null;
      else {
        const target = Math.atan2(gx, gz);
        const dYaw = Math.atan2(Math.sin(target - s.yaw), Math.cos(target - s.yaw));
        s.yaw += dYaw * Math.min(1, dt * 6);
        fwd = Math.abs(dYaw) < 0.8 ? Math.min(1, dist / 1.2) : 0;
        side = 0;
      }
    }
    const speed = k.has("shift") ? 4.2 : 1.9;
    // you walk where you look
    const viewYaw = s.yaw + look.current.yaw;
    const fx = Math.sin(viewYaw);
    const fz = Math.cos(viewYaw);
    let nx = s.x + (fx * fwd - fz * side) * speed * dt;
    let nz = s.z + (fz * fwd + fx * side) * speed * dt;
    const segs = s.building != null ? col.insideFor(s.building, s.floor) : col.outside;
    [nx, nz] = resolve(nx, nz, segs);
    const moving = Math.hypot(nx - s.x, nz - s.z) > 1e-4;
    // stop auto-walking if a wall blocks the way
    if (goal.current && fwd > 0.5 && Math.hypot(nx - s.x, nz - s.z) < speed * dt * 0.15) goal.current = null;
    s.x = nx;
    s.z = nz;

    // step through an entrance into (or out of) a clad building
    if (s.building == null) {
      for (const c of CLAD) {
        const b = lane.buildings.find((x) => x.id === c.id)!;
        if (pointInPoly(s.x, s.z, b.pts)) {
          s.building = c.id;
          s.floor = 0;
          onEnterExit(c.id);
        }
      }
    } else if (s.floor === 0) {
      const b = lane.buildings.find((x) => x.id === s.building)!;
      if (!pointInPoly(s.x, s.z, b.pts)) {
        s.building = null;
        onEnterExit(null);
      }
    }

    bob.current += moving ? dt * speed * 3.2 : 0;
    const y = (s.building != null ? floorBase(s.floor) : 0) + EYE + (moving ? Math.sin(bob.current) * 0.035 : 0);
    camera.position.set(s.x, y, s.z);
    const pitch = THREE.MathUtils.clamp(s.pitch + look.current.pitch, -1.45, 1.45);
    const cp = Math.cos(pitch);
    camera.lookAt(s.x + fx * cp, y + Math.sin(pitch), s.z + fz * cp);
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.near !== 0.08) {
      cam.near = 0.08;
      cam.fov = 70;
      cam.updateProjectionMatrix();
    }
    WALKER.active = s.building == null;
    WALKER.pos.set(s.x, 0, s.z);
  });
  return null;
}

/** Put the walker at a building's lift on the chosen floor. */
export function liftTo(state: WalkState, id: number, floor: number) {
  const b = lane.buildings.find((x) => x.id === id)!;
  const f = frameOf(b.pts);
  const l = liftLocal(f);
  const spec = cladById.get(id)!;
  // a gallery has no lift landing of its own: arrive at the railing side instead
  const [x, z] = spec.floors[floor].voidBelow ? toWorld(f, -f.L / 2 + 1.6, 0) : toWorld(f, l.u - l.w / 2 - 1.3, 0);
  state.x = x;
  state.z = z;
  state.building = id;
  state.floor = floor;
  state.yaw = spec.floors[floor].voidBelow ? Math.atan2(f.ca, f.sa) : Math.atan2(-f.ca, -f.sa);
  state.pitch = spec.floors[floor].voidBelow ? -0.25 : 0;
}

/** Stand outside a building's entrance, facing in. */
export function frontOf(id: number): WalkState {
  const b = lane.buildings.find((x) => x.id === id)!;
  const segs = exteriorSegments(b.pts, true, cladById.get(id)?.face);
  // the entrance is the gap between two consecutive segments on the front edge
  let gap: [XZ, XZ] | null = null;
  for (let i = 0; i < segs.length - 1; i++) {
    const end = segs[i][1];
    const next = segs[i + 1][0];
    if (Math.hypot(end[0] - next[0], end[1] - next[1]) > 1) gap = [end, next];
  }
  const [a, c] = gap ?? [b.pts[0], b.pts[1]];
  const mx = (a[0] + c[0]) / 2;
  const mz = (a[1] + c[1]) / 2;
  let nx = (c[1] - a[1]);
  let nz = -(c[0] - a[0]);
  const len = Math.hypot(nx, nz) || 1;
  nx /= len;
  nz /= len;
  if (pointInPoly(mx + nx * 0.5, mz + nz * 0.5, b.pts)) {
    nx = -nx;
    nz = -nz;
  }
  return { x: mx + nx * 6, z: mz + nz * 6, yaw: Math.atan2(-nx, -nz), pitch: 0.05, building: null, floor: 0 };
}
