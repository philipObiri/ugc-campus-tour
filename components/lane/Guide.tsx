"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { CAFETERIA, CLAD, STUDENT_SERVICES } from "@/lib/campus";
import { floorLine, guideStops, type GuideStop } from "@/lib/guide";
import { distToSeg, lane, pointInPoly, type XZ } from "@/lib/laneGeometry";
import { isMuted } from "@/lib/sfx";
import { frontOf, type WalkState } from "./Walk";

export type GuideHud = {
  arrow: React.RefObject<HTMLDivElement | null>;
  dist: React.RefObject<HTMLSpanElement | null>;
  next: React.RefObject<HTMLSpanElement | null>;
  looking: React.RefObject<HTMLSpanElement | null>;
};

export type GuideSay = { title: string; line: string };

let voiceOn = true;
export const setGuideVoice = (on: boolean) => {
  voiceOn = on;
  if (!on && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
};

/** Read narration aloud with the browser's built-in speech (no downloads); respects mute. */
export function speak(text: string) {
  if (!voiceOn || isMuted() || typeof speechSynthesis === "undefined") return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = speechSynthesis.getVoices().find((x) => /en-(GB|GH|NG|ZA)/i.test(x.lang)) ?? speechSynthesis.getVoices().find((x) => x.lang.startsWith("en"));
  if (v) u.voice = v;
  u.rate = 1;
  u.pitch = 1;
  speechSynthesis.speak(u);
}

/** Places the guide can name when you look at them (outline + name). */
function landmarks() {
  const out: { name: string; pts: XZ[] }[] = [];
  for (const c of CLAD) {
    const b = lane.buildings.find((x) => x.id === c.id);
    if (b) out.push({ name: c.title, pts: b.pts });
  }
  for (const sb of [CAFETERIA, STUDENT_SERVICES]) out.push({ name: sb.name, pts: sb.pts });
  for (const b of lane.buildings) if (b.name && !CLAD.some((c) => c.id === b.id)) out.push({ name: b.name, pts: b.pts });
  return out;
}

/** Which named place contains (or nearly touches) a point on the ground plan. */
function placeAt(marks: { name: string; pts: XZ[] }[], x: number, z: number) {
  for (const m of marks) {
    if (pointInPoly(x, z, m.pts)) return m.name;
    for (let i = 0; i < m.pts.length; i++) if (distToSeg(x, z, m.pts[i], m.pts[(i + 1) % m.pts.length]) < 0.8) return m.name;
  }
  return null;
}

/**
 * Live walking-tour guide: a gold beacon marks the next stop, narration plays on arrival,
 * the HUD arrow/distance update every frame, and "Looking at" names what's in front of you.
 */
export function GuideBrain({ walk, hud, onSay, onDone }: {
  walk: React.RefObject<WalkState>;
  hud: GuideHud;
  onSay: (s: GuideSay) => void;
  onDone: () => void;
}) {
  const { camera, scene } = useThree();
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const stops = useMemo<GuideStop[]>(() => guideStops((id) => {
    const f = frontOf(id);
    return [f.x, f.z];
  }), []);
  const idx = useRef(0);
  const last = useRef<{ building: number | null; floor: number }>({ building: null, floor: -1 });
  const frame = useRef(0);
  const marks = useMemo(() => landmarks(), []);
  const beacon = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const started = useRef(false);

  useFrame(({ clock }) => {
    const s = walk.current;
    if (!started.current) {
      started.current = true;
      onSay({ title: "Your UGC guide", line: "Akwaaba! Follow the gold beacon and I'll show you around. Scroll or use the arrow keys to walk, and move the mouse to look around." });
    }
    camera.getWorldDirection(dir);
    const viewYaw = Math.atan2(dir.x, dir.z);
    const stop = stops[idx.current];

    // arrival at a stop (or stepping into its building)
    if (stop) {
      const d = Math.hypot(stop.pos[0] - s.x, stop.pos[1] - s.z);
      if ((s.building == null && d < stop.radius) || (stop.building != null && s.building === stop.building)) {
        onSay({ title: stop.title, line: stop.line });
        speak(stop.line);
        idx.current++;
        if (idx.current >= stops.length) onDone();
      }
    }
    // narration when the lift opens on a new floor
    if (s.building !== last.current.building || s.floor !== last.current.floor) {
      const justWalkedIn = last.current.building == null && s.floor === 0; // the arrival line already covers this
      if (s.building != null && !justWalkedIn && last.current.floor !== -1) {
        const fl = floorLine(s.building, s.floor);
        if (fl) {
          onSay(fl);
          speak(fl.line);
        }
      }
      last.current = { building: s.building, floor: s.floor };
    }

    // live HUD: arrow + distance to the next stop
    const next = stops[idx.current];
    if (hud.arrow.current && hud.dist.current && hud.next.current) {
      if (next && s.building == null) {
        const dx = next.pos[0] - s.x;
        const dz = next.pos[1] - s.z;
        const rel = Math.atan2(Math.sin(Math.atan2(dx, dz) - viewYaw), Math.cos(Math.atan2(dx, dz) - viewYaw));
        hud.arrow.current.style.transform = `rotate(${-rel}rad)`;
        hud.arrow.current.style.opacity = "1";
        hud.dist.current.textContent = `${Math.round(Math.hypot(dx, dz))} m`;
        hud.next.current.textContent = next.title;
      } else {
        hud.arrow.current.style.opacity = "0";
        hud.dist.current.textContent = s.building != null ? "use the lift" : "";
        hud.next.current.textContent = s.building != null ? "Explore this building" : "Tour complete";
      }
    }

    // "Looking at": whatever is in the centre of your view, refreshed a few times a second
    if (frame.current++ % 6 === 0 && hud.looking.current) {
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      ray.camera = camera;
      ray.far = 140;
      let label = "";
      try {
        const hit = ray.intersectObjects(scene.children, true).find((h) => (h.object as THREE.Mesh).isMesh && h.object.visible && h.distance > 0.5);
        if (hit) {
          const name = placeAt(marks, hit.point.x, hit.point.z);
          if (name) label = `${name} · ${Math.round(hit.distance)} m`;
        }
      } catch {
        label = "";
      }
      hud.looking.current.textContent = s.building != null ? "" : label;
    }

    // beacon on the next stop
    if (beacon.current) {
      beacon.current.visible = !!next && s.building == null;
      if (next) beacon.current.position.set(next.pos[0], 0, next.pos[1]);
      if (ring.current) {
        const k = 1 + Math.sin(clock.elapsedTime * 3) * 0.12;
        ring.current.scale.set(k, k, k);
      }
    }
  });

  return (
    <group ref={beacon}>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.12, 0]}>
        <torusGeometry args={[1.4, 0.12, 10, 40]} />
        <meshStandardMaterial color="#d1aa66" emissive="#d1aa66" emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0, 12, 0]}>
        <cylinderGeometry args={[0.45, 0.9, 24, 20, 1, true]} />
        <meshBasicMaterial color="#d1aa66" transparent opacity={0.18} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
