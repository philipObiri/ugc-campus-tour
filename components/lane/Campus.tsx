"use client";

import { Html } from "@react-three/drei";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { labelRoot } from "@/lib/labelRoot";
import {
  CAFETERIA, COMPOUND_WALLS, FLOOR_H, GATE, GROUND_H, STUDENT_SERVICES, TEMPLE_PATH, floorBase, floorTop,
  type CladSpec, type Floor, type Room, type SmallBuilding,
} from "@/lib/campus";
import {
  ENTRANCE_W, exteriorSegments, floorRooms, frameOf, frontEdge, insideFrame, interiorWalls, layoutFloor, liftLocal,
  toWorld, type Frame, type Rect,
} from "@/lib/interiorLayout";
import { GeoBuilder, WALLED_PLOT, addFlatCap, addPitchedRoof, addRibbon, obb, pointInPoly, seeded, type Spec, type XZ } from "@/lib/laneGeometry";
import type { BuildingInfo } from "./Buildings";

// =====================================================================
// Textures
// =====================================================================
function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Circle-cut aluminium panel (2.5 m square): one large hole plus dozens of small ones — used on both UGC buildings. */
let perfTex: THREE.Texture | null = null;
function perforatedTexture() {
  if (perfTex) return perfTex;
  perfTex = canvasTex(512, 512, (ctx) => {
    const bg = ctx.createLinearGradient(0, 0, 512, 512);
    bg.addColorStop(0, "#f4f6f7");
    bg.addColorStop(1, "#dde1e4");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);
    const r = seeded(2025);
    const holes: [number, number, number][] = [];
    const fits = (x: number, y: number, rad: number) => holes.every(([hx, hy, hr]) => Math.hypot(hx - x, hy - y) > hr + rad + 12);
    holes.push([140 + r() * 230, 140 + r() * 230, 82 + r() * 26]);
    for (let i = 0; i < 900 && holes.length < 48; i++) {
      const rad = 9 + Math.pow(r(), 1.8) * 46;
      const x = rad + 6 + r() * (512 - rad * 2 - 12);
      const y = rad + 6 + r() * (512 - rad * 2 - 12);
      if (fits(x, y, rad)) holes.push([x, y, rad]);
    }
    for (const [x, y, rad] of holes) {
      const g = ctx.createRadialGradient(x - rad * 0.25, y - rad * 0.25, rad * 0.1, x, y, rad);
      g.addColorStop(0, "#3d4852");
      g.addColorStop(1, "#11161b");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, rad, Math.PI * 0.9, Math.PI * 1.7);
      ctx.stroke();
    }
    ctx.strokeStyle = "#9aa2a8";
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, 512, 512);
  });
  return perfTex;
}

let glassTex: THREE.Texture | null = null;
function glassTexture() {
  if (glassTex) return glassTex;
  glassTex = canvasTex(128, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, "#41566a");
    g.addColorStop(1, "#151d25");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#b4bcc2";
    ctx.fillRect(0, 0, 6, 128);
    ctx.fillRect(0, 0, 128, 5);
    ctx.fillStyle = "rgba(255,226,170,0.28)";
    ctx.fillRect(18, 58, 92, 44);
  });
  return glassTex;
}

let windowTex: THREE.Texture | null = null;
function smallWindowTexture() {
  if (windowTex) return windowTex;
  windowTex = canvasTex(128, 128, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#f7f7f2";
    ctx.fillRect(24, 28, 80, 58);
    const g = ctx.createLinearGradient(0, 30, 0, 84);
    g.addColorStop(0, "#5e7f99");
    g.addColorStop(1, "#22364a");
    ctx.fillStyle = g;
    ctx.fillRect(28, 32, 72, 50);
  });
  return windowTex;
}

const imgCache = new Map<string, HTMLImageElement>();
function withImage(src: string, draw: (img: HTMLImageElement) => void) {
  const cached = imgCache.get(src);
  if (cached?.complete) return draw(cached);
  const img = cached ?? new Image();
  if (!cached) {
    img.src = src;
    imgCache.set(src, img);
  }
  img.addEventListener("load", () => draw(img), { once: true });
}

/** Building signs drawn from the official UGC logo files (public/brand). */
export const SIGN_ASPECT = 400 / 1024;
function signTexture(kind: "hall" | "main") {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 400;
  const ctx = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const base = () => {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, 1024, 400);
    ctx.strokeStyle = "#d1aa66";
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, 1004, 380);
  };
  base();
  if (kind === "main") {
    // full lockup: seal + "Accra Business School"
    withImage("/brand/ugc-logo.png", (img) => {
      base();
      const h = 340;
      const w = (img.width / img.height) * h;
      ctx.drawImage(img, (1024 - w) / 2, 30, w, h);
      tex.needsUpdate = true;
    });
  } else {
    // "GOLD COAST HALL" box with the crest, as on the real building
    withImage("/brand/ugc-crest.png", (img) => {
      base();
      ctx.drawImage(img, 40, 40, 320, 320);
      ctx.fillStyle = "#d1aa66";
      ctx.font = "600 64px Georgia, serif";
      ctx.fillText("GOLD COAST", 400, 170);
      ctx.font = "bold 150px Georgia, serif";
      ctx.fillText("HALL", 395, 320);
      tex.needsUpdate = true;
    });
  }
  return tex;
}

let paverTex: THREE.Texture | null = null;
function paverTexture() {
  if (paverTex) return paverTex;
  paverTex = canvasTex(128, 128, (ctx) => {
    ctx.fillStyle = "#8f8a82";
    ctx.fillRect(0, 0, 128, 128);
    const r = seeded(12);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 4; x++) {
        const off = y % 2 ? 16 : 0;
        ctx.fillStyle = r() > 0.75 ? "#9b5b45" : r() > 0.5 ? "#a9a49a" : "#b8b2a6";
        ctx.fillRect(x * 32 + off + 1, y * 16 + 1, 30, 14);
      }
  });
  paverTex.repeat.set(1, 1);
  return paverTex;
}

// =====================================================================
// Geometry helpers
// =====================================================================
const C = (c: string) => new THREE.Color(c);
const V3 = (p: XZ, y: number) => new THREE.Vector3(p[0], y, p[1]);

/** Wall quads for a list of segments, normals pointing out of `poly`. UV: u = metres/bay, v = metres/floor. */
function segWalls(gb: GeoBuilder, segs: [XZ, XZ][], poly: XZ[], y0: number, y1: number, color: THREE.Color, bay: number, fh: number, vOffset = 0) {
  for (const [a, b] of segs) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05) continue;
    let nx = (b[1] - a[1]) / len;
    let nz = -(b[0] - a[0]) / len;
    if (pointInPoly((a[0] + b[0]) / 2 + nx * 0.2, (a[1] + b[1]) / 2 + nz * 0.2, poly)) {
      nx = -nx;
      nz = -nz;
    }
    const n = new THREE.Vector3(nx, 0, nz);
    const u0 = (a[0] + a[1]) / bay;
    const u1 = u0 + len / bay;
    const v0 = (y0 - vOffset) / fh;
    const v1 = (y1 - vOffset) / fh;
    gb.quad(V3(a, y0), V3(b, y0), V3(b, y1), V3(a, y1), [u0, v0], [u1, v0], [u1, v1], [u0, v1], color, -1, n);
  }
}

function box(gb: GeoBuilder, f: Frame, u: number, y: number, v: number, su: number, sy: number, sv: number, color: THREE.Color | string, rot = 0) {
  const col = typeof color === "string" ? C(color) : color;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const corner = (du: number, dv: number) => toWorld(f, u + du * cr - dv * sr, v + du * sr + dv * cr);
  const c = [corner(-su / 2, -sv / 2), corner(su / 2, -sv / 2), corner(su / 2, sv / 2), corner(-su / 2, sv / 2)];
  const [cx, cz] = toWorld(f, u, v);
  const y1 = y + sy;
  gb.quad(V3(c[0], y1), V3(c[3], y1), V3(c[2], y1), V3(c[1], y1), [0, 0], [0, 0], [0, 0], [0, 0], col, -1, new THREE.Vector3(0, 1, 0));
  gb.quad(V3(c[0], y), V3(c[1], y), V3(c[2], y), V3(c[3], y), [0, 0], [0, 0], [0, 0], [0, 0], col.clone().multiplyScalar(0.7), -1, new THREE.Vector3(0, -1, 0));
  for (let i = 0; i < 4; i++) {
    const p = c[i];
    const q = c[(i + 1) % 4];
    const n = new THREE.Vector3((p[0] + q[0]) / 2 - cx, 0, (p[1] + q[1]) / 2 - cz).normalize();
    gb.quad(V3(p, y), V3(q, y), V3(q, y1), V3(p, y1), [0, 0], [0, 0], [0, 0], [0, 0], col.clone().multiplyScalar(0.86), -1, n);
  }
}

/** World-space box along a segment (walls, railings). */
function segBox(gb: GeoBuilder, a: XZ, b: XZ, y: number, h: number, thick: number, color: string) {
  const f: Frame = { cx: (a[0] + b[0]) / 2, cz: (a[1] + b[1]) / 2, ca: 1, sa: 0, L: 0, W: 0, pts: [] };
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  box(gb, f, 0, y, 0, len + 0.02, h, thick, color, Math.atan2(b[1] - a[1], b[0] - a[0]));
}

function shape(gb: GeoBuilder, f: Frame, geo: THREE.BufferGeometry, u: number, y: number, v: number, color: string, scale: [number, number, number] = [1, 1, 1]) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const [x, z] = toWorld(f, u, v);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(...scale));
  const pos = g.attributes.position;
  const col = C(color);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i).applyMatrix4(m);
    b.fromBufferAttribute(pos, i + 1).applyMatrix4(m);
    c.fromBufferAttribute(pos, i + 2).applyMatrix4(m);
    gb.tri(a.clone(), b.clone(), c.clone(), [0, 0], [0, 0], [0, 0], col);
  }
}

const HEAD = new THREE.SphereGeometry(0.12, 8, 6);
const TORSO = new THREE.CapsuleGeometry(0.17, 0.3, 3, 8);
const SKIN = ["#5a3a28", "#4a2f20", "#6b4430", "#3d261a"];
const SHIRT = ["#ffffff", "#9cc3e6", "#1f3a68", "#c0392b", "#f1c40f", "#16a085", "#ffffff"];

function seatedPerson(gb: GeoBuilder, f: Frame, u: number, y: number, v: number, r: () => number) {
  shape(gb, f, TORSO, u, y + 0.78, v, SHIRT[Math.floor(r() * SHIRT.length)], [1, 1, 0.75]);
  shape(gb, f, HEAD, u, y + 1.18, v, SKIN[Math.floor(r() * SKIN.length)]);
}

// =====================================================================
// Furniture
// =====================================================================
const FLOOR_COL: Record<string, string> = {
  lobby: "#d9d2c3", cafeteria: "#e3d7bf", kitchen: "#c9cdd0", shop: "#d8cfbf", wc: "#c4ccd1", auditorium: "#5a3b3b",
  gallery: "#5a3b3b", seminar: "#5d6f86", guest: "#a8805a", lounge: "#8a6a4f", lecture: "#4f6683", lab: "#9aa5ad",
  library: "#7a6450", office: "#8c9aa6", board: "#6b5444", admissions: "#d9d2c3", terrace: "#c9c2b4",
};

function furnish(gb: GeoBuilder, f: Frame, room: Room, R: Rect, y: number, r: () => number, voidRect?: Rect) {
  const { u0, u1, v0, v1 } = R;
  const du = u1 - u0;
  const dv = v1 - v0;
  const uc = (u0 + u1) / 2;
  const vc = (v0 + v1) / 2;
  const put = (u: number, yy: number, v: number, su: number, sy: number, sv: number, col: string, rot = 0) => {
    if (insideFrame(f, u, v)) box(gb, f, u, yy, v, su, sy, sv, col, rot);
  };
  const chair = (u: number, v: number, col = "#2d3436", facing = 0) => {
    if (!insideFrame(f, u, v)) return;
    box(gb, f, u, y, v, 0.45, 0.45, 0.45, col);
    box(gb, f, u - Math.cos(facing) * 0.2, y + 0.45, v - Math.sin(facing) * 0.2, 0.08, 0.5, 0.45, col, facing);
  };
  if (room.kind !== "gallery") put(uc, y + 0.01, vc, du - 0.2, 0.03, dv - 0.2, FLOOR_COL[room.kind]);

  switch (room.kind) {
    case "lecture":
    case "seminar": {
      put(u0 + 0.2, y + 0.9, vc, 0.08, 1.5, Math.min(4.5, dv * 0.6), "#eef3f6");
      put(u0 + 1.2, y, vc - dv * 0.3, 0.6, 1.1, 0.6, "#6d4c33");
      for (let u = u0 + 2.6; u < u1 - 0.9; u += 1.45) {
        const len = dv - 1.6;
        if (len < 0.8) continue;
        put(u, y + 0.72, vc, 0.55, 0.05, len, "#c8a477");
        for (let k = -len / 2 + 0.35; k < len / 2; k += 0.75) {
          chair(u + 0.55, vc + k);
          if (r() < 0.55 && insideFrame(f, u + 0.55, vc + k)) seatedPerson(gb, f, u + 0.55, y, vc + k, r);
        }
      }
      break;
    }
    case "auditorium": {
      // as in event photos: red patterned backdrop, wooden stage with steps, maroon seating
      put(u0 + 0.15, y, vc, 0.2, 3.4, dv * 0.75, "#8e1f2a");
      put(u0 + 1.9, y, vc, 3.4, 0.7, dv * 0.75, "#a0703c");
      put(u0 + 3.75, y, vc, 0.3, 0.35, dv * 0.5, "#a0703c");
      put(u0 + 2.4, y + 0.7, vc + dv * 0.22, 0.6, 1.1, 0.6, "#5d4030"); // lectern
      for (let k = -2; k <= 2; k++) put(u0 + 1.2, y + 0.7, vc + k * 0.9, 0.55, 1.2, 0.55, "#7a1f24"); // dignitaries' chairs
      for (const s of [-1, 1]) put(u0 + 3.6, y, vc + s * (dv * 0.42), 0.6, 1.0, 0.6, "#3f7a2a"); // potted plants
      // gold side walls
      put(uc, y, v0 + 0.1, du - 0.4, 3.4, 0.1, "#d9b44a");
      put(uc, y, v1 - 0.1, du - 0.4, 3.4, 0.1, "#d9b44a");
      for (let u = u0 + 4.6; u < u1 - 0.8; u += 1.0) {
        for (let v = v0 + 1; v < v1 - 0.8; v += 0.62) {
          if (Math.abs(v - vc) < 0.75) continue;
          put(u + 0.15, y, v, 0.45, 0.45, 0.5, "#7a1f2e");
          put(u + 0.38, y + 0.45, v, 0.08, 0.55, 0.5, "#7a1f2e");
          if (r() < 0.45 && insideFrame(f, u + 0.15, v)) seatedPerson(gb, f, u + 0.15, y, v, r);
        }
      }
      break;
    }
    case "gallery": {
      // balcony floor around the void, with a glass railing and seats facing in
      if (!voidRect) break;
      for (let u = u0 + 0.5; u < u1; u += 1) {
        for (let v = v0 + 0.5; v < v1; v += 1) {
          const inVoid = u > voidRect.u0 && u < voidRect.u1 && v > voidRect.v0 && v < voidRect.v1;
          if (!inVoid && insideFrame(f, u, v, 0)) box(gb, f, u, y - 0.25, v, 1.01, 0.25, 1.01, "#5a3b3b");
        }
      }
      const { u0: a0, u1: a1, v0: b0, v1: b1 } = voidRect;
      for (const [p, q] of [[[a0, b0], [a1, b0]], [[a1, b0], [a1, b1]], [[a1, b1], [a0, b1]], [[a0, b1], [a0, b0]]] as [number, number][][]) {
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        for (let d = 0.5; d < len; d += 1) {
          const t = d / len;
          const u = p[0] + (q[0] - p[0]) * t;
          const v = p[1] + (q[1] - p[1]) * t;
          if (!insideFrame(f, u, v, 0)) continue;
          box(gb, f, u, y, v, Math.abs(q[0] - p[0]) > 0.1 ? 1.01 : 0.06, 1.05, Math.abs(q[1] - p[1]) > 0.1 ? 1.01 : 0.06, "#cfe6ef");
          // a row of seats just behind the railing, facing the void
          const out = Math.abs(q[0] - p[0]) > 0.1 ? [0, v < (b0 + b1) / 2 ? -0.9 : 0.9] : [u < (a0 + a1) / 2 ? -0.9 : 0.9, 0];
          if (insideFrame(f, u + out[0], v + out[1])) {
            box(gb, f, u + out[0], y, v + out[1], 0.5, 0.45, 0.5, "#a3242b");
            if (r() < 0.4) seatedPerson(gb, f, u + out[0], y, v + out[1], r);
          }
        }
      }
      break;
    }
    case "cafeteria": {
      const cv = R.outerV + Math.sign(vc - R.outerV) * 0.9;
      put(uc, y, cv, du * 0.6, 1.0, 0.8, "#8b5a2b");
      put(uc, y + 1.0, cv, du * 0.55, 0.35, 0.5, "#cfe6ef");
      for (let k = 0; k < 3; k++) put(u0 + 0.8 + k * 0.9, y, cv, 0.7, 1.9, 0.7, k % 2 ? "#dfe4e7" : "#c0392b");
      for (let u = u0 + 1.6; u < u1 - 1; u += 2.6) {
        for (let v = v0 + 1.4; v < v1 - 0.9; v += 2.4) {
          if (Math.abs(v - cv) < 1.8) continue;
          put(u, y + 0.72, v, 1.0, 0.05, 1.0, "#f2efe8");
          put(u, y, v, 0.12, 0.72, 0.12, "#555");
          chair(u - 0.8, v, "#e67e22");
          chair(u + 0.8, v, "#e67e22", Math.PI);
          if (r() < 0.5 && insideFrame(f, u - 0.8, v)) seatedPerson(gb, f, u - 0.8, y, v, r);
          if (r() < 0.35 && insideFrame(f, u + 0.8, v)) seatedPerson(gb, f, u + 0.8, y, v, r);
        }
      }
      break;
    }
    case "kitchen":
    case "wc": {
      for (let u = u0 + 1; u < u1 - 0.5; u += 1.3) put(u, y, R.outerV + Math.sign(vc - R.outerV) * 0.9, 0.06, 2, 1.6, "#9fb3c0");
      break;
    }
    case "guest": {
      const out = Math.sign(R.outerV - vc);
      const bedV = R.outerV - out * 1.2;
      put(uc, y, bedV, 1.7, 0.55, 2.1, "#f4f1ea");
      put(uc, y + 0.55, bedV - out * 0.15, 1.62, 0.06, 1.6, "#8e5a3a");
      put(uc, y + 0.55, R.outerV - out * 0.35, 1.4, 0.16, 0.4, "#ffffff");
      put(uc, y, R.outerV - out * 0.12, 1.9, 1.2, 0.1, "#5d4030");
      put(uc + 1.2, y, R.outerV - out * 0.4, 0.45, 0.55, 0.45, "#6d4c33");
      put(uc - 1.1, y, vc - out * (dv / 2 - 0.45), 0.9, 2.0, 0.55, "#7a5a3c");
      put(uc + 1.0, y + 0.72, vc - out * 0.6, 0.6, 0.05, 1.0, "#7a5638");
      chair(uc + 0.55, vc - out * 0.6);
      put(u0 + 0.9, y, vc - out * (dv / 2 - 1.0), 1.6, 2.3, 1.8, "#e6edf0");
      break;
    }
    case "lounge":
    case "lobby":
    case "admissions": {
      if (room.kind !== "lounge") {
        put(uc, y, vc - dv * 0.25, Math.min(5, du * 0.5), 1.1, 0.8, "#111111");
        put(uc, y + 1.1, vc - dv * 0.25, Math.min(5, du * 0.5), 0.08, 0.9, "#d1aa66");
        seatedPerson(gb, f, uc, y, vc - dv * 0.25 - 0.9, r);
      }
      for (let u = u0 + 1.6; u < u1 - 1.2; u += 3.4) {
        put(u, y, vc + dv * 0.15, 2.2, 0.45, 0.9, room.kind === "lounge" ? "#7a1f24" : "#5b6b7a");
        put(u, y + 0.45, vc + dv * 0.15 + 0.4, 2.2, 0.45, 0.15, room.kind === "lounge" ? "#7a1f24" : "#5b6b7a");
        put(u, y, vc - dv * 0.05, 1.0, 0.4, 0.6, "#6d4c33");
        if (r() < 0.5) seatedPerson(gb, f, u - 0.5, y, vc + dv * 0.15, r);
      }
      for (const [pu, pv] of [[u0 + 0.6, v0 + 0.6], [u1 - 0.6, v1 - 0.6]]) {
        if (!insideFrame(f, pu, pv)) continue;
        put(pu, y, pv, 0.5, 0.5, 0.5, "#6d4c33");
        shape(gb, f, HEAD, pu, y + 1.0, pv, "#3f7a2a", [3.5, 3.5, 3.5]);
      }
      break;
    }
    case "lab": {
      for (let u = u0 + 1.5; u < u1 - 0.8; u += 2) {
        for (let v = v0 + 1.2; v < v1 - 0.8; v += 1.3) {
          put(u, y + 0.72, v, 0.75, 0.05, 1.1, "#e7e9eb");
          put(u - 0.15, y + 0.77, v, 0.06, 0.45, 0.6, "#111");
          chair(u + 0.6, v, "#111111");
          if (r() < 0.6 && insideFrame(f, u + 0.6, v)) seatedPerson(gb, f, u + 0.6, y, v, r);
        }
      }
      break;
    }
    case "library": {
      for (let u = u0 + 1.2; u < u1 - 0.8; u += 1.8) put(u, y, vc + dv * 0.18, 0.45, 2.1, dv * 0.45, "#5d4030");
      break;
    }
    case "office": {
      for (let u = u0 + 1.4; u < u1 - 0.8; u += 2.8) {
        for (const side of [-0.25, 0.25]) {
          const v = vc + dv * side;
          put(u, y + 0.72, v, 1.4, 0.05, 0.7, "#8b6b4a");
          put(u, y + 0.77, v - 0.2, 0.5, 0.35, 0.05, "#111");
          chair(u, v + 0.6);
          if (r() < 0.5 && insideFrame(f, u, v + 0.6)) seatedPerson(gb, f, u, y, v + 0.6, r);
          put(u + 1.1, y, v, 0.05, 1.3, 1.6, "#9fb3c0");
        }
      }
      break;
    }
    case "board": {
      put(uc, y + 0.74, vc, du * 0.6, 0.06, 1.4, "#4a3324");
      for (let u = uc - du * 0.27; u <= uc + du * 0.27; u += 0.9) {
        chair(u, vc - 1.1, "#111");
        chair(u, vc + 1.1, "#111", Math.PI);
      }
      put(u0 + 0.2, y + 0.9, vc, 0.08, 1.4, 2.6, "#eef3f6");
      break;
    }
    case "terrace": {
      for (let u = u0 + 2; u < u1 - 1.5; u += 4) {
        for (let v = v0 + 2; v < v1 - 1.5; v += 4) {
          put(u, y + 0.72, v, 1.0, 0.05, 1.0, "#f2efe8");
          chair(u - 0.8, v);
          chair(u + 0.8, v, "#2d3436", Math.PI);
        }
      }
      break;
    }
  }
}

/** The opening in a gallery floor (auditorium below shows through it). */
function galleryVoid(f: Frame): Rect {
  return { u0: -f.L / 2 + 3.2, u1: f.L / 2 - 3.2, v0: -f.W / 2 + 3.2, v1: f.W / 2 - 3.2, outerV: 0 };
}

// =====================================================================
// Exterior shell of a clad building
// =====================================================================
export type ViewMode = { type: "full" } | { type: "cut"; floor: number } | { type: "walk"; floor: number };

export function CladBuilding({ info, spec, mode, highlight, onPick, hideLabel = false }: {
  info: BuildingInfo; spec: CladSpec; mode: ViewMode; highlight: boolean; onPick: () => void; hideLabel?: boolean;
}) {
  const { b } = info;
  const levels = spec.floors.length;
  const fullH = floorBase(levels);
  const tex = useMemo(() => ({ perf: perforatedTexture(), glass: glassTexture(), sign: signTexture(spec.sign) }), [spec.sign]);
  const fe = useMemo(() => frontEdge(b.pts, spec.face), [b.pts, spec.face]);

  const parts = useMemo(() => {
    const top = mode.type === "cut" ? floorBase(mode.floor) + 1.2 : fullH + 0.9;
    const glass = new GeoBuilder();
    const panels = new GeoBuilder();
    const slab = new GeoBuilder();
    const white = C("#ffffff");
    // ground floor: glazed, with the entrance opening on the front edge
    segWalls(glass, exteriorSegments(b.pts, true, spec.face), b.pts, 0, Math.min(GROUND_H, top), white, 2.5, GROUND_H);
    // above the entrance, a lintel band of cladding
    if (top > GROUND_H) segWalls(panels, exteriorSegments(b.pts, false), b.pts, GROUND_H, top, white, 3.2, 3.2, GROUND_H);
    segWalls(slab, exteriorSegments(b.pts, false), b.pts, GROUND_H - 0.3, GROUND_H + 0.05, C("#d4d7d9"), 3, 3);
    if (mode.type === "full") addFlatCap(slab, b.pts, fullH, C("#a9a59c"), 0);
    if (mode.type !== "full") {
      const fl = mode.floor;
      if (!spec.floors[fl].voidBelow) addFlatCap(slab, b.pts, floorBase(fl) + 0.005, C("#cfc8bb"), 0);
      if (mode.type === "walk") {
        // ceiling over the current storey (a gallery shares its ceiling with the auditorium below)
        const ceilFloor = spec.floors[fl + 1]?.voidBelow ? fl + 1 : fl;
        addFlatCap(slab, b.pts, floorTop(ceilFloor) - 0.01, C("#efece6"), 0);
      }
    }
    return { glass: glass.build(), panels: panels.build(), slab: slab.build() };
  }, [b.pts, mode, fullH, spec.floors, spec.face]);

  const mx = (fe.a[0] + fe.b[0]) / 2 + fe.nx * 0.3;
  const mz = (fe.a[1] + fe.b[1]) / 2 + fe.nz * 0.3;
  const yaw = Math.atan2(fe.nx, fe.nz);
  const signW = Math.min(fe.len * 0.85, spec.sign === "main" ? 14 : 15);
  const showOutside = mode.type !== "cut";

  return (
    <group onClick={(e) => (e.stopPropagation(), onPick())}>
      <mesh geometry={parts.glass} castShadow receiveShadow>
        <meshStandardMaterial map={tex.glass} roughness={0.15} metalness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={parts.panels} castShadow receiveShadow>
        <meshStandardMaterial map={tex.perf} roughness={0.55} metalness={0.08} color="#ffffff" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={parts.slab} receiveShadow castShadow>
        <meshStandardMaterial roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {showOutside && (
        <>
          <mesh position={[mx, fullH - 4.2, mz]} rotation={[0, yaw, 0]} castShadow>
            <planeGeometry args={[signW, signW * SIGN_ASPECT]} />
            <meshStandardMaterial map={tex.sign} roughness={0.5} />
          </mesh>
          {/* entrance canopy, door frame and open glass doors */}
          <mesh position={[mx + fe.nx * 1.5, GROUND_H - 0.15, mz + fe.nz * 1.5]} rotation={[0, yaw, 0]} castShadow>
            <boxGeometry args={[ENTRANCE_W + 3, 0.25, 3.2]} />
            <meshStandardMaterial color="#cfd3d6" metalness={0.5} roughness={0.4} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[mx - fe.nz * 0 + Math.cos(yaw) * s * (ENTRANCE_W / 2 + 0.1), GROUND_H / 2 - 0.4, mz - Math.sin(yaw) * s * (ENTRANCE_W / 2 + 0.1)]} rotation={[0, yaw, 0]}>
              <boxGeometry args={[0.25, GROUND_H - 0.8, 0.3]} />
              <meshStandardMaterial color="#2b2f33" metalness={0.6} roughness={0.3} />
            </mesh>
          ))}
          {mode.type === "full" &&
            [[-4, 0], [0, 2], [4, -1]].map(([dx, dz], i) =>
              pointInPoly(b.c[0] + dx, b.c[1] + dz, b.pts) ? (
                <mesh key={i} position={[b.c[0] + dx, fullH + 0.9, b.c[1] + dz]} castShadow>
                  <cylinderGeometry args={[0.8, 0.8, 1.8, 16]} />
                  <meshStandardMaterial color="#1b1d1f" roughness={0.6} />
                </mesh>
              ) : null,
            )}
        </>
      )}
      {mode.type === "full" && !hideLabel && (
        <Html portal={labelRoot} position={[b.c[0] + (spec.key === "hall" ? -6 : 6), fullH + 6, b.c[1]]} center zIndexRange={[30, 10]}>
          <div className={`bld-tag ugc ${highlight ? "on" : ""}`} onClick={onPick}>
            <b>★</b>
            <span>{spec.title}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

// =====================================================================
// Furnished interior of one floor
// =====================================================================
function interiorGeometry(pts: XZ[], spec: CladSpec, floorIdx: number, wallH: number, seed: number) {
  const f = frameOf(pts);
  const fl: Floor = spec.floors[floorIdx];
  const y = floorBase(floorIdx) + 0.02;
  const gb = new GeoBuilder();
  const r = seeded(seed + floorIdx * 31);
  const { slots, hasFull } = layoutFloor(f, fl);
  for (const [a, b] of interiorWalls(f, fl)) segBox(gb, a, b, y, wallH, 0.14, "#f1ece2");
  if (!hasFull) box(gb, f, 0, y, 0, f.L - 0.4, 0.025, 2.5, "#cfc6b6");
  const voidRect = fl.voidBelow ? galleryVoid(f) : undefined;
  for (const s of slots) furnish(gb, f, s.room, s.rect, y, r, voidRect);
  // lift & stair core (not on a gallery — it is reached from the auditorium level)
  const lift = liftLocal(f);
  if (!fl.voidBelow && insideFrame(f, lift.u, lift.v, 0)) {
    box(gb, f, lift.u, y, lift.v, lift.w, Math.min(wallH, 2.6), lift.d, "#8d9196");
    box(gb, f, lift.u - lift.w / 2 - 0.02, y, lift.v, 0.06, 2.2, 1.1, "#c9cdd1"); // lift doors
  }
  return { geo: gb.build(), y, f };
}

/** Grand chandelier hanging in the auditorium of UGC Hall. */
function Chandelier({ x, y, z }: { x: number; y: number; z: number }) {
  const crystals = useMemo(() => {
    const out: [number, number, number][] = [];
    for (const [rad, yy, n] of [[1.6, 0, 20], [1.1, 0.6, 14], [0.6, 1.1, 9]] as const)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        out.push([Math.cos(a) * rad, yy - 0.35, Math.sin(a) * rad]);
      }
    return out;
  }, []);
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 1.8, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 2.2, 6]} />
        <meshStandardMaterial color="#b8912f" metalness={0.9} roughness={0.25} />
      </mesh>
      {[[1.6, 0], [1.1, 0.6], [0.6, 1.1]].map(([rad, yy], i) => (
        <mesh key={i} position={[0, yy, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[rad, 0.05, 8, 40]} />
          <meshStandardMaterial color="#d4a83a" metalness={0.95} roughness={0.2} emissive="#7a5a10" emissiveIntensity={0.3} />
        </mesh>
      ))}
      {crystals.map((p, i) => (
        <mesh key={i} position={p}>
          <octahedronGeometry args={[0.09, 0]} />
          <meshStandardMaterial color="#fff8e6" emissive="#ffe7b0" emissiveIntensity={1.4} metalness={0.2} roughness={0.05} />
        </mesh>
      ))}
      <mesh position={[0, -0.3, 0]}>
        <sphereGeometry args={[0.35, 16, 12]} />
        <meshStandardMaterial color="#fff2cc" emissive="#ffd98a" emissiveIntensity={2} />
      </mesh>
      <pointLight position={[0, -0.5, 0]} intensity={60} distance={22} color="#f0dcb4" />
    </group>
  );
}

export function Interior({ info, spec, floor, wallH, activeRoom, onRoom }: {
  info: BuildingInfo; spec: CladSpec; floor: number; wallH: number; activeRoom: string | null; onRoom: (room: Room) => void;
}) {
  const { b } = info;
  const fl = spec.floors[floor];
  const cur = useMemo(() => interiorGeometry(b.pts, spec, floor, wallH, b.id), [b.pts, spec, floor, wallH, b.id]);
  // a gallery looks down into the auditorium below
  const below = useMemo(() => (fl.voidBelow ? interiorGeometry(b.pts, spec, floor - 1, Math.min(wallH, 3.2), b.id) : null), [b.pts, spec, floor, fl.voidBelow, wallH, b.id]);
  const rooms = useMemo(() => floorRooms(cur.f, fl), [cur.f, fl]);
  const hasAuditorium = spec.floors.some((x) => x.rooms.some((r) => r.kind === "auditorium"));
  const audFloor = spec.floors.findIndex((x) => x.rooms.some((r) => r.kind === "auditorium"));
  const showChandelier = hasAuditorium && (floor === audFloor || fl.voidBelow);
  const [chx, chz] = toWorld(cur.f, cur.f.L * 0.12, 0);

  return (
    <group>
      <mesh geometry={cur.geo} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      {below && (
        <mesh geometry={below.geo} receiveShadow>
          <meshStandardMaterial vertexColors roughness={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}
      {showChandelier && <Chandelier x={chx} y={floorTop(audFloor + 1) - 2.6} z={chz} />}
      {rooms.map((s) => (
        <Html portal={labelRoot} key={s.room.name} position={[s.center[0], cur.y + 2.3, s.center[1]]} center zIndexRange={[35, 20]}>
          <div className={`room-tag ${activeRoom === s.room.name ? "on" : ""}`} onClick={() => onRoom(s.room)}>
            {s.room.name}
          </div>
        </Html>
      ))}
    </group>
  );
}

/** Ref for a label that fades in only when the camera is within `near` metres. */
function useNearFade(pos: [number, number, number], near = 70) {
  const ref = useRef<HTMLDivElement>(null);
  const { camera } = useThree();
  const p = useMemo(() => new THREE.Vector3(...pos), [pos[0], pos[1], pos[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(() => {
    if (!ref.current) return;
    const d = camera.position.distanceTo(p);
    const o = THREE.MathUtils.clamp((near - d) / 20, 0, 1);
    ref.current.style.opacity = String(o);
    ref.current.style.pointerEvents = o > 0.3 ? "auto" : "none";
  });
  return ref;
}

// =====================================================================
// Forecourt: gate, compound wall, paving, cafeteria, Student Services Centre
// =====================================================================
function SmallBuildingMesh({ sb, walk, onPick }: { sb: SmallBuilding; walk: boolean; onPick: (sb: SmallBuilding) => void }) {
  const parts = useMemo(() => {
    const walls = new GeoBuilder();
    const roof = new GeoBuilder();
    const plain = new GeoBuilder();
    const interior = new GeoBuilder();
    // walls with a door gap
    const segs: [XZ, XZ][] = [];
    for (let i = 0; i < sb.pts.length; i++) {
      const a = sb.pts[i];
      const b = sb.pts[(i + 1) % sb.pts.length];
      const [d0, d1] = sb.door;
      const onEdge = (p: XZ) => Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) < 0.01 && Math.min(a[0], b[0]) - 0.01 <= p[0] && p[0] <= Math.max(a[0], b[0]) + 0.01 && Math.min(a[1], b[1]) - 0.01 <= p[1] && p[1] <= Math.max(a[1], b[1]) + 0.01;
      if (onEdge(d0) && onEdge(d1)) {
        const da = Math.hypot(d0[0] - a[0], d0[1] - a[1]) < Math.hypot(d1[0] - a[0], d1[1] - a[1]) ? [d0, d1] : [d1, d0];
        segs.push([a, da[0]], [da[1], b]);
        segWalls(walls, [[da[0], da[1]]], sb.pts, 2.4, sb.height, C(sb.wall), 3, 3.2); // lintel
      } else segs.push([a, b]);
    }
    segWalls(walls, segs, sb.pts, 0, sb.height, C(sb.wall), 3, 3.2);
    // red trim bands (Student Services Centre is red and white)
    for (const [a, b] of segs) {
      segBox(plain, a, b, 0, 0.45, 0.22, sb.trim);
      if (sb.height > 4) segBox(plain, a, b, 3.2, 0.35, 0.22, sb.trim);
      segBox(plain, a, b, sb.height - 0.4, 0.4, 0.22, sb.trim);
    }
    for (const p of sb.pts) segBox(plain, [p[0] - 0.2, p[1]], [p[0] + 0.2, p[1]], 0, sb.height, 0.4, sb.trim);
    const box = obb(sb.pts);
    const spec: Spec = { levels: 1, height: sb.height, roof: "hip", wall: C(sb.wall), roofColor: C(sb.roof), box };
    addPitchedRoof(roof, plain, spec, -1, C("#f1efe8"), C("#5a5f63"));
    addFlatCap(plain, sb.pts, 0.03, C("#cfc6b6"), -1);
    // furnish the inside
    const f = frameOf(sb.pts);
    const r = seeded(sb.id.length * 97);
    const room: Room = sb.id === "cafeteria"
      ? { name: sb.name, kind: "cafeteria", band: "full", share: 1 }
      : { name: sb.name, kind: "admissions", band: "full", share: 1 };
    furnish(interior, f, room, { u0: -f.L / 2, u1: f.L / 2, v0: -f.W / 2, v1: f.W / 2, outerV: -f.W / 2 }, 0.04, r);
    return { walls: walls.build(), roof: roof.build(), plain: plain.build(), interior: interior.build() };
  }, [sb]);
  const tex = useMemo(() => smallWindowTexture(), []);
  const [cx, cz] = [(sb.pts[0][0] + sb.pts[2][0]) / 2, (sb.pts[0][1] + sb.pts[2][1]) / 2];
  const tagRef = useNearFade([cx, sb.height + 3.5, cz]);
  return (
    <group onClick={(e) => (e.stopPropagation(), onPick(sb))}>
      <mesh geometry={parts.walls} castShadow receiveShadow>
        <meshStandardMaterial map={tex} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={parts.roof} castShadow visible={!walk}>
        <meshStandardMaterial vertexColors roughness={0.45} metalness={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={parts.plain} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={parts.interior} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      {!walk && (
        <Html portal={labelRoot} position={[cx, sb.height + 3.5, cz]} center zIndexRange={[25, 10]}>
          <div className="bld-tag" ref={tagRef} style={{ opacity: 0 }} onClick={() => onPick(sb)}>
            <span>{sb.name}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

export function Forecourt({ walk, onPick }: { walk: boolean; onPick: (sb: SmallBuilding) => void }) {
  const gateRef = useNearFade([(GATE.a[0] + GATE.b[0]) / 2, 4, GATE.a[1]]);
  const signPos: [number, number, number] = [TEMPLE_PATH[0][0] + 1.8, 0, TEMPLE_PATH[0][1] - 1.8];
  const signRef = useNearFade([signPos[0], 2.6, signPos[2]], 45);
  // paved footpath (with kerbs) beside the cafeteria, leading to Temple Christian International School
  const path = useMemo(() => {
    const gb = new GeoBuilder();
    addRibbon(gb, TEMPLE_PATH, 2.4, 0.07, new THREE.Color("#8f8a82"));
    addRibbon(gb, TEMPLE_PATH, 1.9, 0.08, new THREE.Color("#c9c2b4"));
    return gb.build();
  }, []);
  const geo = useMemo(() => {
    const gb = new GeoBuilder();
    // bare walled plot with grass, west of the Main Campus
    if (WALLED_PLOT.length > 2) {
      addFlatCap(gb, WALLED_PLOT, 0.05, C("#6f9a45"), -1);
      for (let i = 0; i < WALLED_PLOT.length; i++) {
        const a = WALLED_PLOT[i];
        const b = WALLED_PLOT[(i + 1) % WALLED_PLOT.length];
        segBox(gb, a, b, 0, 2.2, 0.25, "#efe4cf");
        segBox(gb, a, b, 2.2, 0.15, 0.35, "#b5653d");
      }
    }
    // Horizontal black metal slats on posts (the street frontage is a slatted sliding gate, not a wall).
    const slats = (a: XZ, b: XZ, h: number) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let y = 0.18; y < h - 0.05; y += 0.24) segBox(gb, a, b, y, 0.13, 0.05, "#141414");
      segBox(gb, a, b, h, 0.08, 0.1, "#0c0c0c"); // top rail
      for (let d = 0; d <= len + 0.01; d += 2.4) {
        const t = Math.min(1, d / len);
        const x = a[0] + (b[0] - a[0]) * t;
        const z = a[1] + (b[1] - a[1]) * t;
        segBox(gb, [x - 0.06, z], [x + 0.06, z], 0, h + 0.1, 0.12, "#0c0c0c");
      }
    };
    for (const [a, b] of COMPOUND_WALLS) {
      const front = Math.abs(a[1] - GATE.a[1]) < 0.01 && Math.abs(b[1] - GATE.a[1]) < 0.01;
      if (front) slats(a, b, 2.3);
      else {
        segBox(gb, a, b, 0, 2.2, 0.25, "#efe4cf");
        segBox(gb, a, b, 2.2, 0.15, 0.35, "#b5653d");
      }
    }
    // black gate posts, ground track, and the sliding leaf pulled back behind the fence (gate open)
    for (const p of [GATE.a, GATE.b]) segBox(gb, [p[0] - 0.15, p[1]], [p[0] + 0.15, p[1]], 0, 2.6, 0.3, "#0a0a0a");
    segBox(gb, [GATE.a[0] - 5.2, GATE.a[1] - 0.45], [GATE.b[0] + 0.2, GATE.a[1] - 0.45], 0, 0.04, 0.12, "#3a3a3a");
    slats([GATE.a[0] - 5, GATE.a[1] - 0.45], [GATE.a[0] - 0.2, GATE.a[1] - 0.45], 2.2);
    return gb.build();
  }, []);
  const paving = useMemo(() => {
    const t = paverTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(9, 5);
    return t;
  }, []);
  return (
    <group>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      {/* interlocking pavers across the forecourt in front of both buildings */}
      <mesh rotation-x={-Math.PI / 2} position={[1, 0.035, 1.5]} receiveShadow>
        <planeGeometry args={[36, 17]} />
        <meshStandardMaterial map={paving} roughness={0.95} />
      </mesh>
      <mesh geometry={path} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.95} />
      </mesh>
      {/* signpost at the start of the footpath */}
      <group position={signPos}>
        <mesh position={[0, 1.2, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 2.4, 6]} />
          <meshStandardMaterial color="#1a1a1a" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0.9, 2.2, 0]} rotation={[0, -0.06, 0]} castShadow>
          <boxGeometry args={[1.9, 0.4, 0.06]} />
          <meshStandardMaterial color="#0a0a0a" />
        </mesh>
        <mesh position={[0.9, 2.2, 0.035]} rotation={[0, -0.06, 0]}>
          <boxGeometry args={[1.8, 0.04, 0.01]} />
          <meshStandardMaterial color="#d1aa66" />
        </mesh>
        <Html portal={labelRoot} position={[0.9, 2.75, 0]} center zIndexRange={[25, 10]}>
          <div ref={signRef} className="street-sign path-sign" style={{ opacity: 0 }}>
            ↑ Temple Christian International School
          </div>
        </Html>
      </group>
      <SmallBuildingMesh sb={CAFETERIA} walk={walk} onPick={onPick} />
      <SmallBuildingMesh sb={STUDENT_SERVICES} walk={walk} onPick={onPick} />
      {!walk && (
        <Html portal={labelRoot} position={[(GATE.a[0] + GATE.b[0]) / 2, 4, GATE.a[1]]} center zIndexRange={[25, 10]}>
          <div className="bld-tag" ref={gateRef} style={{ opacity: 0 }}>
            <span>Main Gate</span>
          </div>
        </Html>
      )}
    </group>
  );
}

export const FLOOR_HEIGHT = FLOOR_H;
