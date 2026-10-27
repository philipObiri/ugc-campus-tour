"use client";

import { Html, Line } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { labelRoot } from "@/lib/labelRoot";
import { cladById } from "@/lib/campus";
import {
  GeoBuilder, addFlatCap, addPitchedRoof, addWalls, lane, pointInPoly, seeded, specFor,
  type LaneBuilding, type Spec, type XZ,
} from "@/lib/laneGeometry";

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

/** One 3 m bay × one 3.2 m floor: plastered wall with a framed window and burglar-proof bars. */
function windowTexture() {
  return canvasTex(128, 128, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 128, 128);
    // floor band
    ctx.fillStyle = "rgba(0,0,0,0.07)";
    ctx.fillRect(0, 120, 128, 8);
    // rain staining under the sill
    const st = ctx.createLinearGradient(0, 88, 0, 120);
    st.addColorStop(0, "rgba(90,70,50,0.12)");
    st.addColorStop(1, "rgba(90,70,50,0)");
    ctx.fillStyle = st;
    ctx.fillRect(30, 88, 68, 32);
    // frame + glass
    ctx.fillStyle = "#f7f7f2";
    ctx.fillRect(26, 26, 76, 60);
    const g = ctx.createLinearGradient(0, 30, 0, 82);
    g.addColorStop(0, "#5e7f99");
    g.addColorStop(1, "#22364a");
    ctx.fillStyle = g;
    ctx.fillRect(30, 30, 68, 52);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(30, 30);
    ctx.lineTo(60, 30);
    ctx.lineTo(30, 62);
    ctx.fill();
    // louvre mullion + burglar bars
    ctx.strokeStyle = "#e9e9e2";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(64, 30);
    ctx.lineTo(64, 82);
    ctx.stroke();
    ctx.strokeStyle = "rgba(40,40,40,0.55)";
    ctx.lineWidth = 1.5;
    for (let x = 38; x < 98; x += 9) {
      ctx.beginPath();
      ctx.moveTo(x, 30);
      ctx.lineTo(x, 82);
      ctx.stroke();
    }
    // sill
    ctx.fillStyle = "#d9d6cc";
    ctx.fillRect(24, 86, 80, 4);
  });
}

/** Long-span corrugated roofing sheet: ribs run down the slope; one tile = 0.9 m. */
function ribTexture() {
  return canvasTex(128, 16, (ctx) => {
    const img = ctx.createImageData(128, 16);
    for (let x = 0; x < 128; x++) {
      const phase = (x / 128) * 5 * Math.PI * 2;
      // trapezoidal IBR-style ribs: sharp crest, flat pan
      const crest = Math.max(0, Math.cos(phase));
      const v = 0.72 + 0.28 * Math.pow(crest, 3) - (Math.sin(phase) > 0.92 ? 0.12 : 0);
      for (let y = 0; y < 16; y++) {
        const i = (y * 128 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(v * 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // sheet overlap lines
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, 128, 1);
  });
}

function concreteTexture() {
  return canvasTex(128, 128, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 128, 128);
    const r = seeded(77);
    for (let i = 0; i < 600; i++) {
      ctx.fillStyle = `rgba(60,55,45,${r() * 0.08})`;
      ctx.fillRect(r() * 128, r() * 128, 2 + r() * 6, 2 + r() * 6);
    }
  });
}

/** UGC Hall cladding: square 2.5 m aluminium panels, each with one big circle and many small ones. */
export type BuildingInfo = { b: LaneBuilding; spec: Spec };

export function useLaneBuildings() {
  return useMemo(() => {
    const infos: BuildingInfo[] = lane.buildings.map((b) => {
      const spec = specFor(b);
      return { b, spec };
    });
    const walls = new GeoBuilder();
    const roofs = new GeoBuilder();
    const plain = new GeoBuilder();
    const concrete = new GeoBuilder();
    const tanks: [number, number, number][] = [];
    const fascia = new THREE.Color("#efece4");
    const ridge = new THREE.Color("#5a5f63");
    const slab = new THREE.Color("#b9b4a8");

    infos.forEach(({ b, spec }, idx) => {
      if (cladById.has(b.id)) return; // drawn by <CladBuilding>
      if (spec.roof === "flat") {
        addWalls(walls, b.pts, 0, spec.height + 0.8, spec.wall, idx);
        addFlatCap(concrete, b.pts, spec.height, slab, idx);
        const r = seeded(b.id + 7);
        const n = b.area > 300 ? 2 : b.area > 70 ? 1 : 0;
        for (let k = 0; k < n; k++) {
          const x = b.c[0] + (r() - 0.5) * spec.box.L * 0.4;
          const z = b.c[1] + (r() - 0.5) * spec.box.W * 0.4;
          if (pointInPoly(x, z, b.pts)) tanks.push([x, spec.height, z]);
        }
      } else {
        addWalls(walls, b.pts, 0, spec.height, spec.wall, idx);
        addPitchedRoof(roofs, plain, spec, idx, fascia, ridge);
      }
    });
    return { infos, walls: walls.build(), wallOwner: walls.owner, roofs: roofs.build(), roofOwner: roofs.owner, plain: plain.build(), plainOwner: plain.owner, concrete: concrete.build(), concreteOwner: concrete.owner, tanks };
  }, []);
}

export function Buildings({ data, onHover, onPick }: {
  data: ReturnType<typeof useLaneBuildings>;
  onHover: (idx: number | null) => void;
  onPick: (idx: number) => void;
}) {
  const tex = useMemo(() => ({ win: windowTexture(), rib: ribTexture(), concrete: concreteTexture() }), []);
  const handlers = (owner: number[]) => ({
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onHover(e.faceIndex != null ? owner[e.faceIndex] ?? null : null);
    },
    onPointerOut: () => onHover(null),
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.faceIndex != null && owner[e.faceIndex] >= 0) onPick(owner[e.faceIndex]);
    },
  });
  return (
    <group>
      <mesh geometry={data.walls} castShadow receiveShadow {...handlers(data.wallOwner)}>
        <meshStandardMaterial map={tex.win} vertexColors roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={data.roofs} castShadow receiveShadow {...handlers(data.roofOwner)}>
        <meshStandardMaterial map={tex.rib} vertexColors roughness={0.45} metalness={0.45} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={data.plain} castShadow {...handlers(data.plainOwner)}>
        <meshStandardMaterial vertexColors roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={data.concrete} receiveShadow {...handlers(data.concreteOwner)}>
        <meshStandardMaterial map={tex.concrete} vertexColors roughness={0.95} />
      </mesh>
      <Polytanks positions={data.tanks} />
    </group>
  );
}

/** Black Polytank water tanks on flat roofs — a fixture of Accra rooftops. */
function Polytanks({ positions }: { positions: [number, number, number][] }) {
  const ref = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.75, 0.75, 1.7, 16);
    geo.translate(0, 0.85, 0); // sits flush on the roof slab
    return geo;
  }, []);
  const inst = useMemo(() => {
    const m = new THREE.InstancedMesh(ref, new THREE.MeshStandardMaterial({ color: "#1b1d1f", roughness: 0.6 }), Math.max(1, positions.length));
    const mat = new THREE.Matrix4();
    positions.forEach(([x, y, z], i) => m.setMatrixAt(i, mat.makeTranslation(x, y, z)));
    m.count = positions.length;
    m.castShadow = true;
    return m;
  }, [positions, ref]);
  return <primitive object={inst} />;
}

export function Highlight({ info }: { info: BuildingInfo | null }) {
  if (!info) return null;
  const { b, spec } = info;
  const top = spec.height + (spec.roof === "flat" ? 1 : 3);
  const ring = (y: number) => [...b.pts, b.pts[0]].map(([x, z]) => [x, y, z] as [number, number, number]);
  return (
    <group>
      <Line points={ring(0.4)} color="#d1aa66" lineWidth={3} />
      <Line points={ring(top)} color="#d1aa66" lineWidth={2} transparent opacity={0.8} />
    </group>
  );
}

/** Name tags for mapped businesses; shown only when the camera is close, so rooftops stay uncluttered. */
export function BuildingLabels({ infos, onPick, active }: { infos: BuildingInfo[]; onPick: (i: number) => void; active: number | null }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const hidden = useRef<boolean[]>([]);
  const frame = useRef(0);
  const { camera, scene } = useThree();
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    // every few frames, hide tags whose building is blocked by something nearer the camera
    const check = frame.current++ % 8 === 0;
    const meshes = check ? scene.children.filter((o) => o.type === "Mesh" || o.type === "Group" || o.type === "InstancedMesh") : [];
    infos.forEach((info, i) => {
      const el = refs.current[i];
      if (!el) return;
      const d = Math.hypot(camera.position.x - info.b.c[0], camera.position.y - info.spec.height, camera.position.z - info.b.c[1]);
      if (check && d < 75) {
        tmp.set(info.b.c[0], info.spec.height + 2.5, info.b.c[1]).sub(camera.position);
        const dist = tmp.length();
        ray.set(camera.position, tmp.normalize());
        ray.camera = camera; // fat lines (Line2) need the camera to raycast
        ray.far = dist;
        let hit: THREE.Intersection | undefined;
        try {
          hit = ray.intersectObjects(meshes, true).find((h) => (h.object as THREE.Mesh).isMesh && h.object.visible && !(h.object as THREE.Object3D & { isLine2?: boolean }).isLine2);
        } catch {
          hit = undefined;
        }
        // blocked if the first thing hit is well short of the tag (i.e. not this building's own roof)
        hidden.current[i] = !!hit && hit.distance < dist - Math.sqrt(info.b.area) * 0.75 - 3;
      }
      const show = active === i || (d < 75 && !hidden.current[i]);
      el.style.opacity = active === i ? "1" : show ? String(THREE.MathUtils.clamp((90 - d) / 25, 0, 1)) : "0";
      el.style.pointerEvents = show ? 'auto' : 'none';
    });
  });
  return (
    <>
      {infos.map((info, i) =>
        info.b.name && !cladById.has(info.b.id) ? (
          <Html portal={labelRoot} key={info.b.id} position={[info.b.c[0], info.spec.height + 2.5, info.b.c[1]]} center zIndexRange={[25, 10]}>
            <div
              ref={(el) => {
                refs.current[i] = el;
              }}
              className={`bld-tag ${active === i ? "on" : ""}`}
              style={{ opacity: 0 }}
              onClick={() => onPick(i)}
            >
              <span>{info.b.name}</span>
            </div>
          </Html>
        ) : null,
      )}
    </>
  );
}
