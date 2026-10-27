"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, QuadraticBezierLine, Stars } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { labelRoot } from "@/lib/labelRoot";
import {
  ACCRA_PATCH, AFRICA, GHANA_PATCH, SITE_PATCH, UGC, WREXHAM, ZOOM_STOPS,
} from "@/lib/data";
import {
  EARTH_KM, countryAt, latLngToVec3, makeAccraTexture, makeEarthTexture, makeGhanaTexture,
  makeGlowTexture, makeSiteTexture, vec3ToLatLng,
} from "@/lib/geo";
import { chime, whoosh } from "@/lib/sfx";
import { isTouchDevice } from "@/lib/joystick";

const MAX_Z = 5; // 0..4 = zoom stops, 4..5 = final dive into campus
const { damp, clamp, lerp, smoothstep } = THREE.MathUtils;

type Nav = {
  z: number;
  target: number;
  dragLat: number;
  dragLng: number;
  dragging: boolean;
  moved: number;
  lastInteract: number;
};

type Hud = {
  readout: RefObject<HTMLDivElement | null>;
  streak: RefObject<HTMLDivElement | null>;
  mist: RefObject<HTMLDivElement | null>;
  flash: RefObject<HTMLDivElement | null>;
};

const ramp = (z: number, a: number, b: number, c: number, d: number) =>
  smoothstep(z, a, b) * (1 - smoothstep(z, c, d));

/** Camera state for a continuous zoom value. */
function viewAt(z: number) {
  if (z < 0) {
    const s = ZOOM_STOPS[0];
    return { lat: s.lat, lng: s.lng, alt: s.altKm * Math.exp(-z * 1.6) };
  }
  if (z >= 4) {
    const t = z - 4;
    const s = ZOOM_STOPS[4];
    return { lat: s.lat, lng: s.lng, alt: Math.exp(lerp(Math.log(s.altKm), Math.log(0.18), t)) };
  }
  const i = Math.min(Math.floor(z), 3);
  const t = z - i;
  const a = ZOOM_STOPS[i];
  const b = ZOOM_STOPS[i + 1];
  const e = 1 - Math.pow(1 - t, 3); // pan arrives before the zoom does
  return {
    lat: lerp(a.lat, b.lat, e),
    lng: lerp(a.lng, b.lng, e),
    alt: Math.exp(lerp(Math.log(a.altKm), Math.log(b.altKm), t)),
  };
}

function CameraRig({ nav, hud, onEnter, onLevel }: { nav: Nav; hud: Hud; onEnter: () => void; onLevel: (i: number) => void }) {
  const { camera } = useThree();
  const entered = useRef(true);
  const lastLevel = useRef(-1);
  const look = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    dt = Math.min(dt, 0.05);
    nav.z = damp(nav.z, nav.target, nav.target > nav.z ? 2.4 : 3, dt);
    if (Math.abs(nav.z - nav.target) < 0.0005) nav.z = nav.target;
    const z = nav.z;

    // Free spin only at the planetary scale; drift back over Africa when idle or zooming in.
    if (!nav.dragging) {
      const idle = performance.now() - nav.lastInteract > 2500;
      const k = z > 0.55 ? 2.5 : idle ? 1.1 : 0;
      nav.dragLat = damp(nav.dragLat, 0, k, dt);
      nav.dragLng = damp(nav.dragLng, 0, k, dt);
    }

    const v = viewAt(z);
    const lat = v.lat + nav.dragLat;
    const lng = v.lng + nav.dragLng;
    const dist = 1 + v.alt / EARTH_KM;
    // Tilt toward the horizon as we get close, for a cinematic approach.
    const tilt = (v.alt / 111) * 0.55 * smoothstep(z, 2.2, 4.6);
    camera.position.copy(latLngToVec3(lat - tilt, lng, dist));
    const surface = latLngToVec3(lat, lng, 1);
    look.set(0, 0, 0).lerp(surface, smoothstep(z, 0.4, 1.8));
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    const cam = camera as THREE.PerspectiveCamera;
    cam.near = Math.max((v.alt / EARTH_KM) * 0.02, 1e-7);
    cam.far = dist + 2;
    cam.updateProjectionMatrix();

    const level = Math.round(clamp(z, 0, 4));
    if (Math.abs(z - level) < 0.06 && level !== lastLevel.current) {
      lastLevel.current = level;
      onLevel(level);
    }
    if (z < 4.5) entered.current = false;
    if (z > 4.92 && !entered.current) {
      entered.current = true;
      onEnter();
    }

    if (hud.readout.current) {
      const alt = v.alt >= 10 ? `${Math.round(v.alt).toLocaleString()} km` : `${(v.alt * 1000).toFixed(0)} m`;
      hud.readout.current.textContent = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? "N" : "S"}  ${Math.abs(lng).toFixed(4)}°${lng >= 0 ? "E" : "W"}  ·  ALT ${alt}`;
    }
    const speed = Math.abs(nav.target - nav.z);
    if (hud.streak.current) hud.streak.current.style.opacity = String(clamp((speed - 0.06) * 1.6, 0, 0.85));
    if (hud.mist.current) hud.mist.current.style.opacity = String(Math.max(ramp(z, 1.25, 1.45, 1.55, 1.78), ramp(z, 2.3, 2.45, 2.55, 2.72)) * 0.8);
    if (hud.flash.current) hud.flash.current.style.opacity = String(smoothstep(z, 4.45, 4.95));
  });
  return null;
}

const atmosphereVert = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const atmosphereFrag = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vNormal;
  void main() {
    float i = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
    gl_FragColor = vec4(0.82, 0.67, 0.40, 1.0) * i * uOpacity;
  }`;

function makeCloudTexture() {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 1024;
  const ctx = c.getContext("2d")!;
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * c.width;
    const y = c.height * (0.15 + Math.random() * 0.7);
    const r = 6 + Math.random() * 34;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.14)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Earth({ nav, onHover, onPick }: {
  nav: Nav;
  onHover: (h: { name: string; x: number; y: number } | null) => void;
  onPick: (name: string) => void;
}) {
  const map = useMemo(() => makeEarthTexture(4096), []);
  const glow = useMemo(() => makeGlowTexture(2048), []);
  const clouds = useMemo(() => makeCloudTexture(), []);
  const cloudRef = useRef<THREE.Mesh>(null);
  const atmo = useRef<THREE.ShaderMaterial>(null);
  const lastHover = useRef(0);

  useFrame((_, dt) => {
    if (cloudRef.current) {
      cloudRef.current.rotation.y += dt * 0.006;
      (cloudRef.current.material as THREE.MeshStandardMaterial).opacity = 0.45 * (1 - smoothstep(nav.z, 1.2, 2));
    }
    if (atmo.current) atmo.current.uniforms.uOpacity.value = 1 - smoothstep(nav.z, 1.4, 2.4);
  });

  const move = (e: ThreeEvent<PointerEvent>) => {
    if (nav.z > 2.2 || nav.dragging) return onHover(null);
    const now = performance.now();
    if (now - lastHover.current < 70) return;
    lastHover.current = now;
    const { lat, lng } = vec3ToLatLng(e.point);
    const name = countryAt(lat, lng);
    onHover(name ? { name, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY } : null);
  };

  return (
    <group>
      <mesh
        onPointerMove={move}
        onPointerOut={() => onHover(null)}
        onPointerDown={(e) => {
          nav.dragging = true;
          nav.moved = 0;
          nav.lastInteract = performance.now();
          (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
        }}
        onClick={(e) => {
          if (nav.moved > 6) return;
          const { lat, lng } = vec3ToLatLng(e.point);
          const name = countryAt(lat, lng);
          if (name) onPick(name);
        }}
      >
        <sphereGeometry args={[1, 192, 128]} />
        <meshStandardMaterial map={map} emissiveMap={glow} emissive="#d1aa66" emissiveIntensity={1.1} roughness={0.9} metalness={0} />
      </mesh>
      <mesh ref={cloudRef} scale={1.012}>
        <sphereGeometry args={[1, 96, 64]} />
        <meshStandardMaterial map={clouds} transparent depthWrite={false} opacity={0.9} />
      </mesh>
      <mesh scale={1.16}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          ref={atmo}
          vertexShader={atmosphereVert}
          fragmentShader={atmosphereFrag}
          uniforms={{ uOpacity: { value: 1 } }}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

const DEG = Math.PI / 180;

function Patch({ bounds, make, fade, order, nav }: {
  bounds: { lonMin: number; lonMax: number; latMin: number; latMax: number };
  make: (b: typeof bounds) => THREE.Texture;
  fade: [number, number, number, number];
  order: number;
  nav: Nav;
}) {
  const tex = useMemo(() => make(bounds), [make, bounds]);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const o = ramp(nav.z, ...fade);
    if (mat.current) mat.current.opacity = o;
    if (mesh.current) mesh.current.visible = o > 0.001;
  });
  return (
    <mesh ref={mesh} renderOrder={order}>
      <sphereGeometry
        args={[
          1, 48, 48,
          (bounds.lonMin + 180) * DEG, (bounds.lonMax - bounds.lonMin) * DEG,
          (90 - bounds.latMax) * DEG, (bounds.latMax - bounds.latMin) * DEG,
        ]}
      />
      <meshBasicMaterial ref={mat} map={tex} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function GeoLabel({ lat, lng, title, sub, fade, nav, onClick, variant = "region" }: {
  lat: number; lng: number; title: string; sub?: string; fade: [number, number, number, number];
  nav: Nav; onClick: () => void; variant?: "region" | "pin";
}) {
  const el = useRef<HTMLDivElement>(null);
  const pos = useMemo(() => latLngToVec3(lat, lng, 1), [lat, lng]);
  const { camera } = useThree();
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (!el.current) return;
    const facing = tmp.copy(camera.position).sub(pos).normalize().dot(pos.clone().normalize());
    const o = ramp(nav.z, ...fade) * smoothstep(facing, 0.05, 0.25);
    el.current.style.opacity = String(o);
    el.current.style.pointerEvents = o > 0.3 ? "auto" : "none";
  });
  return (
    <Html portal={labelRoot} position={pos} center zIndexRange={[20, 10]}>
      <div ref={el} className={variant === "pin" ? "geo-pin" : "geo-label"} onClick={onClick}>
        {variant === "pin" && (
          <span className="pin-dot">
            <i />
            <i />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/ugc-crest.png" alt="" />
          </span>
        )}
        <span className="geo-title">{title}</span>
        {sub && <span className="geo-sub">{sub}</span>}
      </div>
    </Html>
  );
}

const LINKS: { name: string; lat: number; lng: number; tag?: string }[] = [
  { name: "United Kingdom", lat: WREXHAM.lat, lng: WREXHAM.lng, tag: "Wrexham University · MBA partner" },
  { name: "Nigeria", lat: 9.08, lng: 8.68 },
  { name: "Togo", lat: 8.62, lng: 0.82 },
  { name: "Gabon", lat: -0.8, lng: 11.61 },
  { name: "Niger", lat: 17.61, lng: 8.08 },
  { name: "Senegal", lat: 14.5, lng: -14.45 },
  { name: "Zimbabwe", lat: -19.02, lng: 29.15 },
  { name: "Syria", lat: 34.8, lng: 38.99 },
  { name: "India", lat: 20.59, lng: 78.96 },
  { name: "China", lat: 35.86, lng: 104.2 },
  { name: "USA", lat: 39.8, lng: -98.6 },
  { name: "Canada", lat: 56.13, lng: -106.35 },
];

/** Animated gold arcs from UGC to the countries in its global community. */
function GlobalArcs({ nav }: { nav: Nav }) {
  const arcs = useMemo(() => {
    const end = latLngToVec3(UGC.lat, UGC.lng, 1.002);
    return LINKS.map((l) => {
      const start = latLngToVec3(l.lat, l.lng, 1.002);
      const ang = start.angleTo(end);
      const mid = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(1.05 + ang * 0.32);
      return { ...l, start, end, mid, dir: start.clone().normalize() };
    });
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = useRef<any[]>([]);
  const tags = useRef<(HTMLDivElement | null)[]>([]);
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const show = nav.z < 1.6;
    if (group.current) group.current.visible = show;
    lines.current.forEach((ln) => {
      if (ln?.material) ln.material.dashOffset -= dt * 0.6;
    });
    arcs.forEach((arc, i) => {
      const el = tags.current[i];
      if (!el) return;
      // hide tags on the far side of the globe
      const facing = tmp.copy(camera.position).normalize().dot(arc.dir);
      el.style.opacity = show ? String(THREE.MathUtils.clamp((facing - 0.15) * 3, 0, 1) * (1 - THREE.MathUtils.smoothstep(nav.z, 1.0, 1.5))) : "0";
    });
  });
  return (
    <group ref={group}>
      {arcs.map((arc, i) => (
        <group key={arc.name}>
          <QuadraticBezierLine
            ref={(el) => {
              lines.current[i] = el;
            }}
            start={arc.start}
            end={arc.end}
            mid={arc.mid}
            color="#d1aa66"
            lineWidth={1.6}
            dashed
            dashScale={22}
            dashSize={0.5}
            gapSize={0.5}
          />
          <mesh position={arc.start}>
            <sphereGeometry args={[0.008, 10, 8]} />
            <meshBasicMaterial color="#f0dcb4" />
          </mesh>
          <Html portal={labelRoot} position={arc.start.clone().multiplyScalar(1.01)} center zIndexRange={[20, 10]}>
            <div
              ref={(el) => {
                tags.current[i] = el;
              }}
              className="arc-tag"
              style={{ opacity: 0 }}
            >
              {arc.tag ?? arc.name}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

function Scene({ nav, hud, onEnter, onLevel, onHover, onPick, go }: {
  nav: Nav; hud: Hud; onEnter: () => void; onLevel: (i: number) => void;
  onHover: (h: { name: string; x: number; y: number } | null) => void; onPick: (n: string) => void; go: (z: number) => void;
}) {
  return (
    <>
      <color attach="background" args={["#050505"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 2.5, 1.5]} intensity={2.2} color="#fff1d6" />
      <Stars radius={60} depth={30} count={6000} factor={3} saturation={0.4} fade speed={0.6} />
      <Earth nav={nav} onHover={onHover} onPick={onPick} />
      <Patch nav={nav} bounds={GHANA_PATCH} make={makeGhanaTexture} fade={[1.25, 1.8, 3.15, 3.6]} order={2} />
      <Patch nav={nav} bounds={ACCRA_PATCH} make={makeAccraTexture} fade={[2.45, 2.95, 4.1, 4.4]} order={3} />
      <Patch nav={nav} bounds={SITE_PATCH} make={makeSiteTexture} fade={[3.4, 3.8, 9, 10]} order={4} />
      <GlobalArcs nav={nav} />
      <GeoLabel nav={nav} lat={9} lng={20} title="AFRICA" sub="Click to fly in" fade={[-1, -0.5, 1.15, 1.5]} onClick={() => go(1)} />
      <GeoLabel nav={nav} lat={8.6} lng={-1.4} title="GHANA" sub="The Gold Coast" fade={[0.6, 0.95, 2.1, 2.5]} onClick={() => go(2)} />
      <GeoLabel nav={nav} lat={5.86} lng={0.05} title="GREATER ACCRA" sub="Zoom in" fade={[1.7, 2.1, 3.3, 3.6]} onClick={() => go(3)} />
      <GeoLabel nav={nav} variant="pin" lat={UGC.lat} lng={UGC.lng} title="University of Gold Coast" sub="Baatsona · Spintex" fade={[1.9, 2.4, 4.4, 4.7]} onClick={() => go(nav.z > 3.8 ? MAX_Z : 4)} />
      <CameraRig nav={nav} hud={hud} onEnter={onEnter} onLevel={onLevel} />
    </>
  );
}

export default function GlobeStage({ onEnter, onPop, startZ }: { onEnter: () => void; onPop: (msg: string) => void; startZ?: number }) {
  const nav = useRef<Nav>({ z: startZ ?? -0.35, target: startZ != null ? 4 : 0, dragLat: startZ != null ? 0 : 10, dragLng: startZ != null ? 0 : -75, dragging: false, moved: 0, lastInteract: 0 }).current;
  const hud: Hud = {
    readout: useRef<HTMLDivElement>(null),
    streak: useRef<HTMLDivElement>(null),
    mist: useRef<HTMLDivElement>(null),
    flash: useRef<HTMLDivElement>(null),
  };
  const [level, setLevel] = useState(startZ != null ? 4 : 0);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const snapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastWhoosh = useRef(0);

  const go = (z: number) => {
    nav.target = clamp(z, 0, MAX_Z);
    nav.lastInteract = performance.now();
    if (performance.now() - lastWhoosh.current > 700) {
      whoosh(0.8);
      lastWhoosh.current = performance.now();
    }
  };

  useEffect(() => {
    const el = wrap.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const prev = Math.round(nav.target);
      nav.target = clamp(nav.target + e.deltaY * 0.0014, 0, MAX_Z);
      nav.lastInteract = performance.now();
      if (Math.round(nav.target) !== prev && performance.now() - lastWhoosh.current > 700) {
        whoosh(0.7);
        lastWhoosh.current = performance.now();
      }
      clearTimeout(snapTimer.current);
      snapTimer.current = setTimeout(() => {
        nav.target = nav.target > 4.35 ? MAX_Z : Math.round(nav.target);
      }, 380);
    };
    // Track every pointer ourselves: movementX is always 0 for touch, and two fingers = pinch zoom.
    const pts = new Map<number, { x: number; y: number }>();
    let pinchD = 0;
    const onDown = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinchD = Math.hypot(a.x - b.x, a.y - b.y);
        nav.dragging = false;
      }
    };
    const onMove = (e: PointerEvent) => {
      const last = pts.get(e.pointerId);
      if (!last) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        // pinch out = zoom in towards UGC, pinch in = zoom out
        nav.target = clamp(nav.target + (d - pinchD) * 0.006, 0, MAX_Z);
        pinchD = d;
        nav.lastInteract = performance.now();
        clearTimeout(snapTimer.current);
        snapTimer.current = setTimeout(() => {
          nav.target = nav.target > 4.35 ? MAX_Z : Math.round(nav.target);
        }, 380);
        return;
      }
      if (!nav.dragging) return;
      nav.moved += Math.abs(dx) + Math.abs(dy);
      const k = 0.12 * Math.max(0.05, 1 - nav.z * 0.6);
      nav.dragLng = ((nav.dragLng - dx * k + 540) % 360) - 180;
      nav.dragLat = clamp(nav.dragLat + dy * k, -55, 55);
      nav.lastInteract = performance.now();
    };
    const onUp = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      nav.dragging = false;
    };
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointercancel", onUp);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "+" || e.key === "=") go(Math.floor(nav.target) + 1);
      if (e.key === "ArrowUp" || e.key === "-") go(Math.ceil(nav.target) - 1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLevel = (i: number) => {
    setLevel(i);
    if (i > 0) chime(1 + i * 0.12);
  };
  const onPick = (name: string) => {
    if (name === "Ghana") go(2);
    else if (AFRICA.has(name)) {
      go(1);
      onPop(`${name} — part of Africa. Ghana glows gold on the west coast.`);
    } else onPop(`${name} isn't on today's route. Head for the glowing continent →`);
  };

  const stop = ZOOM_STOPS[level];

  return (
    <div ref={wrap} className={`absolute inset-0 select-none ${hover ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}>
      <Canvas
        dpr={isTouchDevice() ? [1, 1.5] : [1, 2]}
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
        camera={{ fov: 45, near: 0.001, far: 100, position: [3, 0, 3] }}
      >
        <Scene nav={nav} hud={hud} onEnter={onEnter} onLevel={onLevel} onHover={setHover} onPick={onPick} go={go} />
      </Canvas>

      {/* zoom effects */}
      <div ref={hud.streak} className="streaks pointer-events-none absolute inset-0 opacity-0" />
      <div ref={hud.mist} className="mist pointer-events-none absolute inset-0 opacity-0" />
      <div className="vignette pointer-events-none absolute inset-0" />
      <div ref={hud.flash} className="pointer-events-none absolute inset-0 bg-[#fff4dc] opacity-0" />

      {/* level rail */}
      <nav className="absolute left-5 top-1/2 hidden -translate-y-1/2 flex-col gap-1 md:flex">
        {ZOOM_STOPS.map((s, i) => (
          <button key={s.key} onClick={() => go(i)} className={`rail-item ${i === level ? "active" : ""}`}>
            <span className="rail-dot" />
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      {/* title card */}
      <div key={stop.key} className="pointer-events-none absolute bottom-24 left-6 md:bottom-28 md:left-40">
        <p className="title-kicker">{String(level + 1).padStart(2, "0")} / 05 · ZOOM LEVEL</p>
        <h2 className="title-card font-display">{stop.label}</h2>
        <p className="title-sub">{stop.sub}</p>
      </div>

      {level === 4 && (
        <button onClick={() => go(MAX_Z)} className="cta enter-cta absolute bottom-24 right-6 rounded-full border border-[#d1aa66]/70 bg-black/50 px-7 py-3.5 text-sm font-semibold text-[#f7ecd6] backdrop-blur md:right-10">
          Land on campus ↓
        </button>
      )}

      <div className="absolute bottom-0 inset-x-0 flex flex-col items-center justify-between gap-2 px-6 pb-5 md:flex-row md:pr-20">
        <p className="text-center text-xs text-white/50">
          <span className="[@media(pointer:coarse)]:hidden">Scroll to zoom · Drag to spin · Hover &amp; click countries and labels</span>
          <span className="hidden [@media(pointer:coarse)]:inline">Pinch to zoom · Swipe to spin · Tap countries and labels</span>
        </p>
        <div ref={hud.readout} className="hidden font-mono text-[11px] tracking-wider text-[#e3c690]/80 sm:block" />
      </div>

      <div className="absolute right-5 top-1/2 flex -translate-y-1/2 flex-col gap-2">
        <button className="zoom-btn" onClick={() => go(Math.floor(nav.target) + 1)} aria-label="Zoom in">+</button>
        <button className="zoom-btn" onClick={() => go(Math.ceil(nav.target) - 1)} aria-label="Zoom out">−</button>
      </div>

      {hover && (
        <div className="country-tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {hover.name}
          {hover.name === "Ghana" ? " · click to zoom" : AFRICA.has(hover.name) ? " · Africa" : ""}
        </div>
      )}
    </div>
  );
}
