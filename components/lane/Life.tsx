"use client";

import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { labelRoot } from "@/lib/labelRoot";
import { honk, pop } from "@/lib/sfx";
import { PERSON_GEO, RIM_GEO, VEHICLE_DIMS, WHEEL_GEO, broadTreeGeometry, kenteTexture, palmGeometry, vehicleParts, type VehicleKind } from "./models";
import { LINES, WALKER, buildSim, separate, stepPeds, stepTrees, stepVehicles, type Ped, type Sim, type Vehicle } from "@/lib/sim";

export { WALKER };

/** The running simulation, so the walker can collide with people and vehicles. */
export const LIVE: { sim: Sim | null } = { sim: null };

// =====================================================================
// Component
// =====================================================================
export default function Life({ onPop, onRide, riding }: { onPop: (m: string) => void; onRide: (v: { pos: THREE.Vector3; yaw: number } | null) => void; riding: boolean }) {
  const sim = useMemo(() => buildSim(), []);
  LIVE.sim = sim;
  const [talking, setTalking] = useState<number | null>(null);
  const { camera } = useThree();
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    stepVehicles(sim, dt);
    stepPeds(sim, dt, clock.elapsedTime, camera.position, tmp);
    separate(sim);
    stepTrees(sim, clock.elapsedTime);
  });

  return (
    <group>
      <Trees sim={sim} />
      {sim.vehicles.map((v) => (
        <VehicleMesh
          key={v.id}
          v={v}
          onClick={() => {
            v.flash = 1.2;
            honk(v.kind === "trotro" ? 0.8 : 1.1);
            if (v.kind === "trotro") {
              if (riding) {
                onRide(null);
                onPop("You hopped off the trotro.");
              } else {
                onRide(v);
                onPop("🚐 Riding the trotro. Drag or scroll to hop off.");
              }
            } else {
              onPop(v.parked ? "🚗 Parked on the laterite lane outside UGC Hall." : v.kind === "taxi" ? "🚕 Accra taxi, with yellow-painted wings. *beep beep*" : "🚗 Beep! Traffic on " + (v.route?.road.name ?? "the lane"));
            }
          }}
        />
      ))}
      {sim.peds.map((p) => (
        <PedMesh
          key={p.id}
          p={p}
          talking={talking === p.id}
          onClick={() => {
            p.state = "wave";
            p.timer = 3.2;
            pop();
            setTalking(p.id);
            onPop(`🎓 "${LINES[p.id % LINES.length]}"`);
          }}
          onBubbleEnd={() => setTalking(null)}
        />
      ))}
    </group>
  );
}

// =====================================================================
// Rendering
// =====================================================================
function Trees({ sim }: { sim: Sim }) {
  const meshes = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide, flatShading: false });
    const make = (geo: THREE.BufferGeometry, list: typeof sim.trees) => {
      const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      list.forEach((t, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
        m.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
        inst.setMatrixAt(i, m);
      });
      inst.count = list.length;
      inst.castShadow = true;
      inst.receiveShadow = true;
      return inst;
    };
    const palms = sim.trees.filter((t) => t.kind === "palm");
    const palm = make(palmGeometry(3), palms);
    sim.palmRefs.push(palm);
    return [palm, make(broadTreeGeometry("mango", 5), sim.trees.filter((t) => t.kind === "mango")), make(broadTreeGeometry("neem", 8), sim.trees.filter((t) => t.kind === "neem"))];
  }, [sim]);
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}

const partsCache = new Map<VehicleKind, ReturnType<typeof vehicleParts>>();
const getParts = (k: VehicleKind) => {
  if (!partsCache.has(k)) partsCache.set(k, vehicleParts(k));
  return partsCache.get(k)!;
};

function VehicleMesh({ v, onClick }: { v: Vehicle; onClick: () => void }) {
  const parts = getParts(v.kind);
  const dims = VEHICLE_DIMS[v.kind];
  const mats = useMemo(() => {
    const brake = new THREE.MeshStandardMaterial({ color: "#7a0d0d", emissive: "#ff2a1a", emissiveIntensity: 0 });
    const head = new THREE.MeshStandardMaterial({ color: "#f4f1e0", emissive: "#fff6d8", emissiveIntensity: 0.1 });
    v.brakeMat = brake;
    v.headMat = head;
    return { brake, head };
  }, [v]);
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!group.current || !body.current) return;
    group.current.position.copy(v.pos);
    group.current.rotation.y = v.yaw - Math.PI / 2; // models face +x
    // pitch under braking/acceleration, slight bounce on laterite
    body.current.rotation.z = THREE.MathUtils.clamp(v.accel * 0.012, -0.05, 0.03);
    body.current.position.y = v.v > 0.3 ? Math.sin(v.wheel * 0.7) * 0.012 : 0;
    for (const w of v.wheels) w.rotation.z = -v.wheel;
    mats.brake.emissiveIntensity = !v.parked && (v.accel < -0.4 || v.v < 0.3) ? 2.2 : 0.15;
    mats.head.emissiveIntensity = v.flash > 0 ? (Math.sin(v.flash * 25) > 0 ? 3 : 0.2) : 0.15;
  });
  const L = dims.length;
  return (
    <group ref={group} onClick={(e) => (e.stopPropagation(), onClick())}>
      <group ref={body}>
        <mesh geometry={parts.body} castShadow receiveShadow>
          <meshStandardMaterial color={v.paint} metalness={0.55} roughness={0.35} />
        </mesh>
        <mesh geometry={parts.glass}>
          <meshStandardMaterial color="#1b2733" metalness={0.8} roughness={0.12} />
        </mesh>
        {parts.stripe && (
          <mesh geometry={parts.stripe}>
            <meshStandardMaterial color={v.kind === "taxi" ? "#f2c318" : "#c0392b"} roughness={0.4} metalness={0.3} />
          </mesh>
        )}
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh position={[L / 2 - 0.05, 0.65, s * (dims.width / 2 - 0.3)]} material={mats.head}>
              <boxGeometry args={[0.12, 0.14, 0.32]} />
            </mesh>
            <mesh position={[-L / 2 + 0.03, 0.72, s * (dims.width / 2 - 0.28)]} material={mats.brake}>
              <boxGeometry args={[0.1, 0.16, 0.3]} />
            </mesh>
            {/* side mirror */}
            <mesh position={[v.kind === "trotro" ? 2.3 : 1.05, v.kind === "trotro" ? 1.7 : 1.0, s * (dims.width / 2 + 0.08)]}>
              <boxGeometry args={[0.12, 0.1, 0.14]} />
              <meshStandardMaterial color="#222" />
            </mesh>
          </group>
        ))}
        {/* bumpers */}
        <mesh position={[L / 2 - 0.02, 0.42, 0]}>
          <boxGeometry args={[0.14, 0.18, dims.width - 0.1]} />
          <meshStandardMaterial color="#2a2a2a" roughness={0.7} />
        </mesh>
        <mesh position={[-L / 2 + 0.02, 0.42, 0]}>
          <boxGeometry args={[0.14, 0.18, dims.width - 0.1]} />
          <meshStandardMaterial color="#2a2a2a" roughness={0.7} />
        </mesh>
      </group>
      {dims.axles.flatMap((ax) =>
        [-1, 1].map((s) => (
          <group
            key={`${ax}${s}`}
            position={[ax, dims.wheelR, s * (dims.width / 2 - 0.08)]}
            ref={(el) => {
              if (el && !v.wheels.includes(el)) v.wheels.push(el);
            }}
          >
            <mesh geometry={WHEEL_GEO} scale={[dims.wheelR, dims.wheelR, 1]} castShadow>
              <meshStandardMaterial color="#151515" roughness={0.9} />
            </mesh>
            <mesh geometry={RIM_GEO} scale={[dims.wheelR, dims.wheelR, 1]}>
              <meshStandardMaterial color="#b9bdc2" metalness={0.8} roughness={0.3} />
            </mesh>
          </group>
        )),
      )}
      {/* generous invisible hit box so moving vehicles are easy to click */}
      <mesh position={[0, 1, 0]} visible={false}>
        <boxGeometry args={[L + 0.6, 2.4, dims.width + 0.6]} />
      </mesh>
    </group>
  );
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
const mat = (c: string) => {
  if (!matCache.has(c)) matCache.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide }));
  return matCache.get(c)!;
};
let kenteMat: THREE.MeshStandardMaterial | null = null;

function PedMesh({ p, talking, onClick, onBubbleEnd }: { p: Ped; talking: boolean; onClick: () => void; onBubbleEnd: () => void }) {
  const L = p.look2;
  const root = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  if (L.kente && !kenteMat) kenteMat = new THREE.MeshStandardMaterial({ map: kenteTexture(), roughness: 0.8 });
  const topMat = L.kente ? kenteMat! : mat(L.top);

  useFrame(({ clock }, dt) => {
    if (!root.current) return;
    root.current.position.copy(p.pos);
    root.current.rotation.y = p.yaw;
    const walking = p.v > 0.15;
    p.phase += dt * (walking ? p.v * 5.2 : 0);
    const swing = walking ? Math.sin(p.phase) * Math.min(0.6, p.v * 0.45) : 0;
    const idleT = clock.elapsedTime + p.id;
    if (legL.current && legR.current) {
      legL.current.rotation.x = swing;
      legR.current.rotation.x = -swing;
    }
    if (armL.current && armR.current) {
      if (p.state === "wave") {
        armR.current.rotation.x = 0;
        armR.current.rotation.z = 2.6 + Math.sin(idleT * 10) * 0.35;
        armL.current.rotation.x = 0;
        armL.current.rotation.z = 0;
      } else if (p.state === "idle") {
        // chatting: occasional gesture
        armR.current.rotation.z = 0;
        armR.current.rotation.x = Math.max(0, Math.sin(idleT * 0.9)) * -0.8;
        armL.current.rotation.x = 0;
        armL.current.rotation.z = 0;
      } else {
        armL.current.rotation.z = 0;
        armR.current.rotation.z = 0;
        armL.current.rotation.x = -swing * 0.8;
        armR.current.rotation.x = swing * 0.8;
      }
    }
    if (torso.current) {
      torso.current.position.y = walking ? Math.abs(Math.cos(p.phase)) * 0.04 : Math.sin(idleT * 1.3) * 0.006;
      torso.current.rotation.y = p.state === "idle" ? Math.sin(idleT * 0.5) * 0.15 : 0;
    }
  });

  return (
    <group ref={root} scale={L.scale} onClick={(e) => (e.stopPropagation(), onClick())}>
      <group ref={torso}>
        {/* legs pivot at the hip */}
        <group ref={legL} position={[-0.1, 0.92, 0]}>
          <mesh geometry={PERSON_GEO.leg} material={L.dress ? mat(L.skin) : mat(L.bottom)} castShadow />
          <mesh geometry={PERSON_GEO.shoe} material={mat("#1a1a1a")} />
        </group>
        <group ref={legR} position={[0.1, 0.92, 0]}>
          <mesh geometry={PERSON_GEO.leg} material={L.dress ? mat(L.skin) : mat(L.bottom)} castShadow />
          <mesh geometry={PERSON_GEO.shoe} material={mat("#1a1a1a")} />
        </group>
        {L.dress ? (
          <mesh geometry={PERSON_GEO.skirt} position={[0, 0.98, 0]} material={mat(L.bottom)} castShadow />
        ) : (
          <mesh geometry={PERSON_GEO.hips} position={[0, 0.98, 0]} material={mat(L.bottom)} />
        )}
        <mesh geometry={PERSON_GEO.torso} position={[0, 1.3, 0]} scale={[1, 1, 0.72]} material={topMat} castShadow />
        <mesh position={[0, 1.58, 0]} material={mat(L.skin)}>
          <cylinderGeometry args={[0.05, 0.055, 0.1, 8]} />
        </mesh>
        <mesh geometry={PERSON_GEO.head} position={[0, 1.71, 0]} material={mat(L.skin)} castShadow />
        {L.wrap ? (
          <mesh geometry={PERSON_GEO.wrap} position={[0, 1.8, -0.01]} material={mat(L.wrap)} />
        ) : (
          <mesh geometry={PERSON_GEO.hair} position={[0, 1.72, -0.005]} material={mat(L.hair)} />
        )}
        {/* arms pivot at the shoulder */}
        <group ref={armL} position={[-0.23, 1.5, 0]}>
          <mesh geometry={PERSON_GEO.upperArm} material={topMat} />
          <mesh geometry={PERSON_GEO.foreArm} material={mat(L.skin)} />
        </group>
        <group ref={armR} position={[0.23, 1.5, 0]}>
          <mesh geometry={PERSON_GEO.upperArm} material={topMat} />
          <mesh geometry={PERSON_GEO.foreArm} material={mat(L.skin)} />
        </group>
      </group>
      <mesh position={[0, 1, 0]} visible={false}>
        <boxGeometry args={[1.2, 2.2, 1.2]} />
      </mesh>
      {talking && (
        <Html portal={labelRoot} position={[0, 2.5, 0]} center zIndexRange={[40, 30]}>
          <div className="bubble" onAnimationEnd={onBubbleEnd}>{LINES[p.id % LINES.length]}</div>
        </Html>
      )}
    </group>
  );
}
