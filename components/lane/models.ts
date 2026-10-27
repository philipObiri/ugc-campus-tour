import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { seeded } from "@/lib/laneGeometry";

// ---------- helpers ----------
function colorize(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, jitter = 0, seed = 1) {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.deleteAttribute("uv");
  const c = new THREE.Color(color);
  const r = seeded(seed);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (r() - 0.5) * jitter;
    for (let j = 0; j < 3; j++) {
      arr[(i + j) * 3] = c.r * k;
      arr[(i + j) * 3 + 1] = c.g * k;
      arr[(i + j) * 3 + 2] = c.b * k;
    }
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

function merge(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts, false)!;
  g.computeBoundingSphere();
  return g;
}

// ---------- trees ----------
/** Coconut palm: curved ringed trunk, drooping pinnate fronds, coconut cluster. */
export function palmGeometry(seed = 1) {
  const r = seeded(seed);
  const H = 11;
  const lean = 0.9 + r() * 1.2;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * 0.2, H * 0.35, 0),
    new THREE.Vector3(lean * 0.6, H * 0.7, 0),
    new THREE.Vector3(lean, H, 0),
  ]);
  const parts: THREE.BufferGeometry[] = [];
  // trunk in banded rings
  for (let s = 0; s < 10; s++) {
    const sub = new THREE.CatmullRomCurve3(curve.getPoints(40).slice(s * 4, s * 4 + 5));
    const tube = new THREE.TubeGeometry(sub, 3, 0.2 - s * 0.008, 7, false);
    parts.push(colorize(tube, s % 2 ? "#7a6450" : "#8d7660", 0.1, s));
  }
  const top = curve.getPoint(1);
  // fronds
  const fronds = 13;
  for (let f = 0; f < fronds; f++) {
    const ang = (f / fronds) * Math.PI * 2 + r() * 0.3;
    const up = f < 3 ? 0.9 : 0.35; // a few young fronds point upward
    const L = 4.2 + r() * 1.3;
    const pos: number[] = [];
    const steps = 14;
    const pt = (t: number) => {
      const d = t * L;
      return new THREE.Vector3(top.x + Math.cos(ang) * d, top.y + d * up - d * d * 0.16, top.z + Math.sin(ang) * d);
    };
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const a = pt(t0);
      const b = pt(t1);
      const side = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang));
      const w = Math.sin(Math.PI * (0.15 + 0.85 * t0)) * 0.9;
      for (const s of [1, -1]) {
        // leaflet hangs out and down from the rachis
        const tip = a.clone().addScaledVector(side, s * w).add(new THREE.Vector3(0, -0.45 * w, 0));
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, tip.x, tip.y, tip.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    parts.push(colorize(g, f % 4 === 0 ? "#6b8f2c" : "#3f7a2a", 0.25, f + seed));
  }
  for (let k = 0; k < 5; k++) {
    const nut = new THREE.SphereGeometry(0.17, 6, 5);
    nut.translate(top.x + Math.cos(k * 1.3) * 0.28, top.y - 0.35, top.z + Math.sin(k * 1.3) * 0.28);
    parts.push(colorize(nut, k % 2 ? "#6b7a2a" : "#5a4a22", 0.1, k));
  }
  return merge(parts);
}

/** Broad tree (mango / neem): forked trunk and a clumped canopy. */
export function broadTreeGeometry(kind: "mango" | "neem", seed = 1) {
  const r = seeded(seed);
  const parts: THREE.BufferGeometry[] = [];
  const trunkH = kind === "mango" ? 2.6 : 4;
  const trunk = new THREE.CylinderGeometry(0.22, 0.34, trunkH, 7);
  trunk.translate(0, trunkH / 2, 0);
  parts.push(colorize(trunk, "#5d4634", 0.1, seed));
  for (let b = 0; b < 3; b++) {
    const br = new THREE.CylinderGeometry(0.09, 0.16, 2.4, 5);
    br.translate(0, 1.2, 0);
    br.rotateZ(0.55 * (b - 1));
    br.rotateY(b * 2.1);
    br.translate(0, trunkH - 0.2, 0);
    parts.push(colorize(br, "#5d4634", 0.1, b));
  }
  const blobs = kind === "mango" ? 9 : 11;
  const spread = kind === "mango" ? 2.6 : 3.4;
  const base = kind === "mango" ? "#2c5a25" : "#4c7d33";
  for (let i = 0; i < blobs; i++) {
    const s = (kind === "mango" ? 1.7 : 1.4) + r() * 0.9;
    const g = new THREE.IcosahedronGeometry(s, 1);
    g.scale(1, kind === "mango" ? 0.8 : 0.55, 1);
    const a = r() * Math.PI * 2;
    const d = r() * spread;
    g.translate(Math.cos(a) * d, trunkH + 1.6 + r() * (kind === "mango" ? 2.2 : 1.2), Math.sin(a) * d);
    parts.push(colorize(g, base, 0.35, i + seed * 10));
  }
  return merge(parts);
}

// ---------- vehicles ----------
function extrudeProfile(points: [number, number][], width: number, bevel = 0.06) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  return g;
}

export type VehicleKind = "sedan" | "taxi" | "trotro";
export const VEHICLE_DIMS: Record<VehicleKind, { length: number; width: number; wheelR: number; axles: number[] }> = {
  sedan: { length: 4.5, width: 1.78, wheelR: 0.32, axles: [1.35, -1.35] },
  taxi: { length: 4.5, width: 1.78, wheelR: 0.32, axles: [1.35, -1.35] },
  trotro: { length: 6.0, width: 2.0, wheelR: 0.36, axles: [1.95, -1.75] },
};

/** Body geometries along +x (front), y up. Returned unmerged so the body can take a paint colour. */
export function vehicleParts(kind: VehicleKind) {
  if (kind === "trotro") {
    const body = extrudeProfile([[-3, 0.38], [2.85, 0.38], [3.0, 0.62], [2.95, 1.05], [2.45, 1.55], [2.05, 2.45], [1.6, 2.6], [-3, 2.6]], 2.0, 0.08);
    const glass = extrudeProfile([[2.4, 1.6], [2.0, 2.4], [-2.6, 2.4], [-2.6, 1.6]], 2.02, 0.01);
    const stripe = extrudeProfile([[-3, 1.0], [2.95, 1.0], [2.95, 1.25], [-3, 1.25]], 2.01, 0.01);
    return { body, glass, stripe };
  }
  const body = extrudeProfile([[-2.25, 0.32], [2.2, 0.32], [2.28, 0.62], [2.15, 0.82], [1.25, 0.92], [0.55, 1.42], [-0.95, 1.44], [-1.7, 0.98], [-2.2, 0.92], [-2.3, 0.6]], 1.78, 0.07);
  const glass = extrudeProfile([[1.18, 0.95], [0.58, 1.36], [-0.92, 1.38], [-1.55, 0.97]], 1.66, 0.02);
  // yellow front and rear wings — the classic Accra taxi livery
  const stripe = kind === "taxi"
    ? mergeGeometries([
        extrudeProfile([[1.45, 0.34], [2.22, 0.34], [2.26, 0.62], [2.12, 0.86], [1.45, 0.9]], 1.8, 0.01),
        extrudeProfile([[-2.27, 0.34], [-1.5, 0.34], [-1.5, 0.95], [-2.18, 0.94], [-2.3, 0.6]], 1.8, 0.01),
      ])!
    : null;
  return { body, glass, stripe };
}

export const WHEEL_GEO = (() => {
  const tyre = new THREE.CylinderGeometry(1, 1, 0.24, 16);
  tyre.rotateX(Math.PI / 2);
  return tyre;
})();
export const RIM_GEO = (() => {
  const rim = new THREE.CylinderGeometry(0.62, 0.62, 0.26, 10);
  rim.rotateX(Math.PI / 2);
  return rim;
})();

// ---------- people ----------
export const PERSON_GEO = {
  torso: new THREE.CapsuleGeometry(0.17, 0.4, 4, 8),
  hips: new THREE.BoxGeometry(0.34, 0.2, 0.2),
  head: new THREE.SphereGeometry(0.115, 12, 10),
  hair: new THREE.SphereGeometry(0.122, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
  wrap: new THREE.CylinderGeometry(0.13, 0.15, 0.16, 12),
  upperArm: (() => {
    const g = new THREE.CapsuleGeometry(0.055, 0.24, 3, 6);
    g.translate(0, -0.16, 0);
    return g;
  })(),
  foreArm: (() => {
    const g = new THREE.CapsuleGeometry(0.045, 0.24, 3, 6);
    g.translate(0, -0.44, 0);
    return g;
  })(),
  leg: (() => {
    const g = new THREE.CapsuleGeometry(0.075, 0.72, 3, 6);
    g.translate(0, -0.44, 0);
    return g;
  })(),
  shoe: (() => {
    const g = new THREE.BoxGeometry(0.11, 0.08, 0.24);
    g.translate(0, -0.88, 0.04);
    return g;
  })(),
  skirt: (() => {
    const g = new THREE.CylinderGeometry(0.17, 0.3, 0.6, 12, 1, true);
    g.translate(0, -0.25, 0);
    return g;
  })(),
};

export function kenteTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const cols = ["#f2c12e", "#1f7a3a", "#c0392b", "#111111", "#f2c12e", "#2e5aa8"];
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = cols[i % cols.length];
    ctx.fillRect(0, i * 8, 64, 8);
  }
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = cols[(i + 2) % cols.length];
    ctx.fillRect(i * 8 + 2, 0, 3, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}
