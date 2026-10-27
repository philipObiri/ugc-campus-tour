"use client";

import { Html } from "@react-three/drei";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { labelRoot } from "@/lib/labelRoot";
import { GeoBuilder, HALL_ACCESS_ROAD_ID, SIDE_LANE_ID, addRibbon, lane, roadSurface, seeded, type XZ } from "@/lib/laneGeometry";

function noiseTexture(base: string, speck: string, n = 2500) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const r = seeded(9);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = speck.replace("A", (r() * 0.35).toFixed(2));
    const s = 1 + r() * 3;
    ctx.fillRect(r() * 256, r() * 256, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function Ground() {
  const tex = useMemo(() => {
    const t = noiseTexture("#ffffff", "rgba(80,50,30,A)", 6000);
    t.repeat.set(120, 120);
    return t;
  }, []);
  const patches = useMemo(() => {
    const r = seeded(4);
    return Array.from({ length: 70 }, () => ({ x: (r() - 0.5) * 560, z: (r() - 0.5) * 560, s: 6 + r() * 18, g: r() }));
  }, []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[1400, 1400]} />
        <meshStandardMaterial map={tex} color="#a9845c" roughness={1} />
      </mesh>
      {patches.map((p, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[p.x, 0.015, p.z]} receiveShadow>
          <circleGeometry args={[p.s, 14]} />
          <meshStandardMaterial color={p.g > 0.5 ? "#6f8d45" : "#8a9a52"} roughness={1} transparent opacity={0.75} />
        </mesh>
      ))}
    </group>
  );
}

export function Roads() {
  const geo = useMemo(() => {
    const gb = new GeoBuilder();
    const drains = new GeoBuilder();
    const marks = new GeoBuilder();
    const laterite = new THREE.Color("#b5653d");
    const asphalt = new THREE.Color("#45464a");
    const drain = new THREE.Color("#8f8b82");
    const white = new THREE.Color("#ece7d6");
    // laterite first, asphalt on top where they meet
    const sorted = [...lane.roads].sort((a, b) => (roadSurface(a) === "asphalt" ? 1 : 0) - (roadSurface(b) === "asphalt" ? 1 : 0));
    sorted.forEach((r, i) => {
      const paved = roadSurface(r) === "asphalt";
      const y = paved ? 0.06 + i * 0.0004 : 0.04 + i * 0.0004;
      addRibbon(gb, r.pts, r.width, y, paved ? asphalt : laterite);
      // open concrete drains along the main streets
      if (r.name || r.kind === "unclassified" || r.id === HALL_ACCESS_ROAD_ID || r.id === SIDE_LANE_ID) {
        addRibbon(drains, r.pts, 0.6, 0.09, drain, -1, r.width / 2 + 0.35);
        addRibbon(drains, r.pts, 0.6, 0.09, drain, -1, -(r.width / 2 + 0.35));
      }
      if (paved && r.width >= 8) {
        // dashed centre line
        for (let k = 0; k < r.pts.length - 1; k++) {
          const [ax, az] = r.pts[k];
          const [bx, bz] = r.pts[k + 1];
          const len = Math.hypot(bx - ax, bz - az);
          for (let d = 0; d < len - 3; d += 9) {
            const t0 = d / len;
            const t1 = (d + 3) / len;
            addRibbon(marks, [[ax + (bx - ax) * t0, az + (bz - az) * t0], [ax + (bx - ax) * t1, az + (bz - az) * t1]] as XZ[], 0.15, 0.1, white, -1, 0.0001);
          }
        }
      }
    });
    return { roads: gb.build(), drains: drains.build(), marks: marks.build() };
  }, []);
  const grain = useMemo(() => noiseTexture("#ffffff", "rgba(60,30,15,A)"), []);
  return (
    <group>
      <mesh geometry={geo.roads} receiveShadow>
        <meshStandardMaterial map={grain} vertexColors roughness={1} />
      </mesh>
      <mesh geometry={geo.drains} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.9} />
      </mesh>
      <mesh geometry={geo.marks}>
        <meshStandardMaterial vertexColors roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Concrete utility poles with crossarms and sagging overhead lines along the main lanes. */
export function Poles() {
  const data = useMemo(() => {
    const poles: { x: number; z: number; yaw: number }[] = [];
    const wires: number[] = [];
    const routes = lane.roads.filter((r) => r.name === "Milton Street" || r.id === HALL_ACCESS_ROAD_ID || r.id === SIDE_LANE_ID || r.name === "Otu Adzin Road");
    for (const r of routes) {
      const side = r.width / 2 + 1.3;
      const line: { x: number; z: number; yaw: number }[] = [];
      let carry = 0;
      for (let k = 0; k < r.pts.length - 1; k++) {
        const [ax, az] = r.pts[k];
        const [bx, bz] = r.pts[k + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const nx = -(bz - az) / len;
        const nz = (bx - ax) / len;
        for (let d = carry; d < len; d += 32) {
          const t = d / len;
          line.push({ x: ax + (bx - ax) * t + nx * side, z: az + (bz - az) * t + nz * side, yaw: Math.atan2(bx - ax, bz - az) });
          carry = d + 32 - len;
        }
        if (carry < 0) carry = 0;
      }
      line.forEach((p, i) => {
        if (Math.hypot(p.x, p.z) > 240) return;
        poles.push(p);
        const q = line[i + 1];
        if (!q || Math.hypot(q.x, q.z) > 240) return;
        for (const off of [-0.9, 0, 0.9]) {
          const ax = p.x + Math.cos(p.yaw) * off;
          const az = p.z - Math.sin(p.yaw) * off;
          const bx = q.x + Math.cos(q.yaw) * off;
          const bz = q.z - Math.sin(q.yaw) * off;
          const N = 10;
          for (let s = 0; s < N; s++) {
            const t0 = s / N;
            const t1 = (s + 1) / N;
            const sag = (t: number) => 8.6 - Math.sin(t * Math.PI) * 0.9;
            wires.push(ax + (bx - ax) * t0, sag(t0), az + (bz - az) * t0, ax + (bx - ax) * t1, sag(t1), az + (bz - az) * t1);
          }
        }
      });
    }
    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute("position", new THREE.Float32BufferAttribute(wires, 3));
    return { poles, wireGeo };
  }, []);

  const inst = useMemo(() => {
    const pole = new THREE.CylinderGeometry(0.12, 0.18, 9, 6);
    pole.translate(0, 4.5, 0);
    const arm = new THREE.BoxGeometry(2.2, 0.12, 0.12);
    arm.translate(0, 8.7, 0);
    const mat = new THREE.MeshStandardMaterial({ color: "#a8a49a", roughness: 0.9 });
    const armMat = new THREE.MeshStandardMaterial({ color: "#5b4a3a", roughness: 0.8 });
    const n = data.poles.length;
    const a = new THREE.InstancedMesh(pole, mat, n);
    const b = new THREE.InstancedMesh(arm, armMat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    data.poles.forEach((p, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw); // crossarm runs across the road
      m.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(1, 1, 1));
      a.setMatrixAt(i, m);
      b.setMatrixAt(i, m);
    });
    a.castShadow = b.castShadow = true;
    return [a, b];
  }, [data.poles]);

  return (
    <group>
      <primitive object={inst[0]} />
      <primitive object={inst[1]} />
      <lineSegments geometry={data.wireGeo}>
        <lineBasicMaterial color="#1c1c1c" transparent opacity={0.7} />
      </lineSegments>
    </group>
  );
}

/** Red-and-white lattice telecom mast, as seen behind the lane in visitor photos (position approximate). */
export function Mast({ x = -38, z = -112 }: { x?: number; z?: number }) {
  const geo = useMemo(() => {
    const pts: number[] = [];
    const cols: number[] = [];
    const H = 42;
    const seg = 14;
    const w = (y: number) => 2.2 - (y / H) * 1.6;
    const red = new THREE.Color("#d3382c");
    const wht = new THREE.Color("#f2f2f2");
    for (let s = 0; s < seg; s++) {
      const y0 = (s / seg) * H;
      const y1 = ((s + 1) / seg) * H;
      const c = s % 2 ? red : wht;
      const corners = (y: number) => [[-w(y), -w(y)], [w(y), -w(y)], [w(y), w(y)], [-w(y), w(y)]];
      const A = corners(y0);
      const B = corners(y1);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        // leg, ring, and X-brace
        const seglist = [[A[i], y0, B[i], y1], [B[i], y1, B[j], y1], [A[i], y0, B[j], y1], [A[j], y0, B[i], y1]] as const;
        for (const [p, ya, q, yb] of seglist) {
          pts.push(p[0], ya, p[1], q[0], yb, q[1]);
          cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    return g;
  }, []);
  return (
    <group position={[x, 0, z]}>
      <lineSegments geometry={geo}>
        <lineBasicMaterial vertexColors />
      </lineSegments>
      {[[0.9, 36, 0], [-0.9, 33, 0], [0, 30, 0.9]].map(([dx, y, dz], i) => (
        <mesh key={i} position={[dx, y, dz]}>
          <boxGeometry args={[0.5, 1.6, 0.25]} />
          <meshStandardMaterial color="#e6e6e6" />
        </mesh>
      ))}
    </group>
  );
}

export function RoadSigns() {
  const signs = useMemo(() => {
    const seen = new Set<string>();
    const out: { name: string; x: number; z: number }[] = [];
    for (const r of lane.roads) {
      if (!r.name || seen.has(r.name)) continue;
      // label the part of the road nearest the campus
      let best = r.pts[0];
      for (const p of r.pts) if (Math.hypot(p[0], p[1]) < Math.hypot(best[0], best[1])) best = p;
      if (Math.hypot(best[0], best[1]) > 230) continue;
      seen.add(r.name);
      out.push({ name: r.name, x: best[0], z: best[1] });
    }
    return out;
  }, []);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const { camera } = useThree();
  // a sign is only readable up close, so fade it out with distance instead of floating over rooftops
  useFrame(() => {
    signs.forEach((s, i) => {
      const el = refs.current[i];
      if (!el) return;
      const d = camera.position.distanceTo(new THREE.Vector3(s.x, 2.6, s.z));
      el.style.opacity = String(THREE.MathUtils.clamp((70 - d) / 20, 0, 1));
    });
  });
  return (
    <>
      {signs.map((s, i) => (
        <group key={s.name} position={[s.x, 0, s.z]}>
          {/* street-name post at the roadside */}
          <mesh position={[0, 1.4, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 2.8, 6]} />
            <meshStandardMaterial color="#8a8f94" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 2.75, 0]}>
            <boxGeometry args={[1.6, 0.35, 0.05]} />
            <meshStandardMaterial color="#1f6b3a" />
          </mesh>
          <Html portal={labelRoot} position={[0, 3.3, 0]} center zIndexRange={[12, 5]}>
            <div
              ref={(el) => {
                refs.current[i] = el;
              }}
              className="street-sign"
              style={{ opacity: 0 }}
            >
              {s.name}
            </div>
          </Html>
        </group>
      ))}
    </>
  );
}
