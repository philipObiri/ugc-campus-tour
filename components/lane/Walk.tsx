"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CLAD, cladById, floorBase } from "@/lib/campus";
import { insideSegments, outsideSegments, pushOutOfBox, resolveCircle } from "@/lib/collision";
import { frameOf, frontEdge, liftLocal, toWorld } from "@/lib/interiorLayout";
import { JOY } from "@/lib/joystick";
import { lane, pointInPoly, type XZ } from "@/lib/laneGeometry";
import { LIVE, WALKER } from "./Life";

export type WalkState = { x: number; z: number; yaw: number; pitch: number; building: number | null; floor: number };

const EYE = 1.65;
const RADIUS = 0.32;

/**
 * First-person walking. Keyboard: WASD / arrows to move, Q/E to turn, Shift to run.
 * Mouse: drag to look, scroll to walk forward/back (sideways swipe to step aside),
 * click a spot on the ground to walk there.
 * Touch: swipe to look, pinch out/in to step forward/back, tap the ground to go there, joystick to walk.
 */
export function WalkController({ state, onEnterExit }: { state: React.RefObject<WalkState>; onEnterExit: (building: number | null) => void }) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const drag = useRef<{ x: number; y: number; moved: number; t: number } | null>(null);
  const marker = useRef<THREE.Mesh>(null);
  const wheel = useRef({ fwd: 0, side: 0 }); // walking impulse from the scroll wheel, decays over time
  const goal = useRef<{ x: number; z: number } | null>(null); // click-to-walk destination
  const hover = useRef({ x: 0, y: 0, on: false }); // cursor position over the view, -1..1
  const look = useRef({ yaw: 0, pitch: 0 }); // head turn that follows the cursor
  const bob = useRef(0);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
      if (e.key === "Escape") goal.current = null;
      keys.current.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const el = gl.domElement;
    const pd = (e: PointerEvent) => {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size >= 2) {
        // second finger down: switch from look to pinch
        drag.current = null;
        const [a, b] = [...touches.current.values()];
        pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
        return;
      }
      drag.current = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
      goal.current = null; // pressing again always takes control back
      try {
        el.setPointerCapture?.(e.pointerId); // keep turning even if the pointer leaves the canvas
      } catch {
        // not capturable (e.g. synthetic pointer): turning still works while over the view
      }
    };
    const pm = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      hover.current = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1, on: inside && e.pointerType === "mouse" };
      if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size >= 2) {
        // pinch out = step forward, pinch in = step back
        const [a, b] = [...touches.current.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        wheel.current.fwd = THREE.MathUtils.clamp(wheel.current.fwd + (d - pinch.current) * 0.012, -1.6, 1.6);
        pinch.current = d;
        goal.current = null;
        return;
      }
      if (!drag.current) return;
      const s = state.current;
      // ~720 px of drag turns you all the way round; look almost straight up or down
      s.yaw -= (e.clientX - drag.current.x) * 0.0085;
      s.pitch = THREE.MathUtils.clamp(s.pitch - (e.clientY - drag.current.y) * 0.0065, -1.45, 1.45);
      drag.current = { ...drag.current, x: e.clientX, y: e.clientY, moved: drag.current.moved + Math.abs(e.clientX - drag.current.x) + Math.abs(e.clientY - drag.current.y) };
    };
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ray = new THREE.Raycaster();
    const pu = (e: PointerEvent) => {
      const wasPinch = touches.current.size >= 2;
      touches.current.delete(e.pointerId);
      if (wasPinch) {
        drag.current = null;
        return;
      }
      const d = drag.current;
      drag.current = null;
      // a click without dragging = walk to the clicked spot on the floor
      if (!d || d.moved > 10 || performance.now() - d.t > 400) return;
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
      wheel.current.fwd = THREE.MathUtils.clamp(wheel.current.fwd - e.deltaY * 0.006, -1.2, 1.2);
      wheel.current.side = THREE.MathUtils.clamp(wheel.current.side + e.deltaX * 0.006, -1, 1);
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
    window.addEventListener("pointercancel", pu);
    return () => {
      window.removeEventListener("pointercancel", pu);
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
    if (keyFwd || keySide || turn || JOY.active) goal.current = null;
    s.yaw += turn * dt * 2.2 - JOY.x * dt * 1.9;
    // moving the mouse turns your head toward it; near the left/right edge you keep turning
    const h = hover.current;
    const dead = (v: number, z: number) => (Math.abs(v) < z ? 0 : (v - Math.sign(v) * z) / (1 - z));
    const lookYaw = h.on && !goal.current && !drag.current ? -dead(h.x, 0.3) * 0.45 : 0;
    const lookPitch = h.on && !goal.current && !drag.current ? -dead(h.y, 0.3) * 0.28 : 0;
    look.current.yaw = THREE.MathUtils.damp(look.current.yaw, lookYaw, 9, dt);
    look.current.pitch = THREE.MathUtils.damp(look.current.pitch, lookPitch, 9, dt);
    if (h.on && !drag.current && !goal.current && Math.abs(h.x) > 0.9) s.yaw -= Math.sign(h.x) * dt * 1.2 * ((Math.abs(h.x) - 0.9) / 0.1);
    // scroll-wheel walking eases out, like letting go of a key
    const w = wheel.current;
    w.fwd = THREE.MathUtils.damp(w.fwd, 0, 9, dt);
    w.side = THREE.MathUtils.damp(w.side, 0, 9, dt);
    if (Math.abs(w.fwd) < 0.03) w.fwd = 0;
    if (Math.abs(w.side) < 0.03) w.side = 0;
    let fwd = THREE.MathUtils.clamp(keyFwd + w.fwd - JOY.y, -1, 1);
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
    const segs = s.building != null ? insideSegments(s.building, s.floor) : outsideSegments();
    if (s.building == null && LIVE.sim) {
      for (const v of LIVE.sim.vehicles) {
        const out = pushOutOfBox(nx, nz, RADIUS, { x: v.pos.x, z: v.pos.z, yaw: v.yaw, hl: v.len / 2, hw: v.halfW });
        if (out) [nx, nz] = out;
      }
      for (const p of LIVE.sim.peds) {
        const dx = nx - p.pos.x;
        const dz = nz - p.pos.z;
        const d = Math.hypot(dx, dz);
        const min = RADIUS + 0.3;
        if (d < min && d > 1e-6) {
          nx = p.pos.x + (dx / d) * min;
          nz = p.pos.z + (dz / d) * min;
        }
      }
    }
    [nx, nz] = resolveCircle(nx, nz, segs, RADIUS);
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
    if (marker.current) {
      marker.current.visible = !!goal.current;
      if (goal.current) marker.current.position.set(goal.current.x, (s.building != null ? floorBase(s.floor) : 0) + 0.06, goal.current.z);
    }
  });
  // where click-to-walk is taking you
  return (
    <mesh ref={marker} rotation-x={-Math.PI / 2} visible={false}>
      <ringGeometry args={[0.35, 0.5, 32]} />
      <meshBasicMaterial color="#d1aa66" transparent opacity={0.9} depthWrite={false} />
    </mesh>
  );
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
  const spec = cladById.get(id);
  // stand in front of the main entrance (the middle of its front wall section)
  const fe = frontEdge(b.pts, spec?.face ?? "south", spec?.frontNear);
  const edgeLen = fe.len || 1;
  const ux = (fe.b[0] - fe.a[0]) / edgeLen;
  const uz = (fe.b[1] - fe.a[1]) / edgeLen;
  const mid: XZ = [(fe.a[0] + fe.b[0]) / 2, (fe.a[1] + fe.b[1]) / 2];
  const a: XZ = [mid[0] - ux, mid[1] - uz];
  const c: XZ = [mid[0] + ux, mid[1] + uz];
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
