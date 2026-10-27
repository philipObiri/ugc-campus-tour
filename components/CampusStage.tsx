"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { CameraControls, Sky } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { TOUR } from "@/lib/tour";
import { CLAD, FLOOR_H, GROUND_H, WALK_SPAWN, cladById, floorBase, type Room, type SmallBuilding } from "@/lib/campus";
import { frameOf } from "@/lib/interiorLayout";
import { chime, pop, whoosh } from "@/lib/sfx";
import { BuildingLabels, Buildings, Highlight, useLaneBuildings } from "./lane/Buildings";
import { CladBuilding, Forecourt, Interior, type ViewMode } from "./lane/Campus";
import { Ground, Mast, Poles, RoadSigns, Roads } from "./lane/Streets";
import Life from "./lane/Life";
import { WalkController, frontOf, liftTo, type WalkState } from "./lane/Walk";
import { GuideBrain, setGuideVoice, type GuideSay } from "./lane/Guide";

const OVERVIEW: [number, number, number, number, number, number] = [-70, 120, 170, 15, 0, -8];
const STOP_MS = 9000;

function Birds({ onPop }: { onPop: (m: string) => void }) {
  const birds = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ r: 50 + i * 7, h: 48 + (i % 3) * 6, a: i * 0.7, s: 0.18 + (i % 4) * 0.03, boost: 0 })), []);
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }, dt) => {
    birds.forEach((b, i) => {
      b.boost = Math.max(0, b.boost - dt * 0.6);
      b.a += (b.s + b.boost) * dt;
      const g = refs.current[i];
      if (!g) return;
      g.position.set(15 + Math.cos(b.a) * b.r, b.h + b.boost * 25, Math.sin(b.a) * b.r);
      g.rotation.y = -b.a;
      const flap = Math.sin(clock.elapsedTime * (10 + b.boost * 20) + i) * 0.6;
      (g.children[0] as THREE.Object3D).rotation.x = flap;
      (g.children[1] as THREE.Object3D).rotation.x = -flap;
    });
  });
  return (
    <>
      {birds.map((b, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          onClick={(e) => {
            e.stopPropagation();
            b.boost = 1.5;
            pop();
            onPop("🕊️ The birds over Baatsona scatter.");
          }}
        >
          <mesh position={[0, 0, 0.6]}>
            <boxGeometry args={[0.35, 0.05, 1.2]} />
            <meshStandardMaterial color="#222" />
          </mesh>
          <mesh position={[0, 0, -0.6]}>
            <boxGeometry args={[0.35, 0.05, 1.2]} />
            <meshStandardMaterial color="#222" />
          </mesh>
          <mesh visible={false}>
            <sphereGeometry args={[2.5]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function RideCam({ cc, target }: { cc: React.RefObject<CameraControls | null>; target: { pos: THREE.Vector3; yaw: number } | null }) {
  useFrame(() => {
    if (!target || !cc.current) return;
    const { pos, yaw } = target;
    void cc.current.setLookAt(pos.x - Math.sin(yaw) * 13, 6.5, pos.z - Math.cos(yaw) * 13, pos.x + Math.sin(yaw) * 8, 1.5, pos.z + Math.cos(yaw) * 8, true);
  });
  return null;
}

type Cut = { id: number; floor: number } | null;

export default function CampusStage({ onBack, onPop }: { onBack: () => void; onPop: (m: string) => void }) {
  const cc = useRef<CameraControls>(null);
  const [idx, setIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [ride, setRide] = useState<{ pos: THREE.Vector3; yaw: number } | null>(null);
  const [welcome, setWelcome] = useState(true);
  const [cut, setCut] = useState<Cut>(null);
  const [cladSel, setCladSel] = useState<number | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [small, setSmall] = useState<SmallBuilding | null>(null);
  const [walk, setWalk] = useState(false);
  const [walkWhere, setWalkWhere] = useState<{ building: number | null; floor: number }>({ building: null, floor: 0 });
  const walkRef = useRef<WalkState>({ ...WALK_SPAWN, pitch: 0, building: null, floor: 0 });
  // live tour guide (walk mode)
  const [say, setSay] = useState<GuideSay | null>(null);
  const [voice, setVoice] = useState(true);
  const [guideOpen, setGuideOpen] = useState(true);
  const guideHud = {
    arrow: useRef<HTMLDivElement>(null),
    dist: useRef<HTMLSpanElement>(null),
    next: useRef<HTMLSpanElement>(null),
    looking: useRef<HTMLSpanElement>(null),
  };
  const rootRef = useRef<HTMLDivElement>(null);
  const [skyHint, setSkyHint] = useState(false);
  const leaving = useRef(0);

  // Scrolling out past the campus lifts you into the sky and back to the globe.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const c = cc.current;
      if (!c || walk) return;
      setSkyHint(c.distance > 450 && e.deltaY > 0);
      if (e.deltaY <= 0) {
        leaving.current = 0;
        return;
      }
      const atTop = c.distance > 640;
      if (!atTop) {
        leaving.current = 0;
        return;
      }
      leaving.current += e.deltaY;
      if (leaving.current > 500) {
        leaving.current = -1e9;
        whoosh(1);
        onBack();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => el.removeEventListener("wheel", onWheel);
  }, [walk, onBack]);
  const data = useLaneBuildings();
  const infoOf = (id: number) => data.infos.find((i) => i.b.id === id)!;

  useEffect(() => {
    const c = cc.current;
    if (!c) return;
    c.smoothTime = 1.4;
    void c.setLookAt(15, 650, 2, 15, 0, 0, false);
    const t = setTimeout(() => void c.setLookAt(...OVERVIEW, true), 150);
    return () => clearTimeout(t);
  }, []);

  const fly = (cam: [number, number, number], target: [number, number, number], offset = true) => {
    if (!cc.current) return;
    cc.current.smoothTime = 0.9;
    void cc.current.setLookAt(...cam, ...target, true);
    void cc.current.setFocalOffset(offset && window.innerWidth > 900 ? 10 : 0, 0, 0, true);
  };

  const showCut = (id: number, floor: number) => {
    setCut({ id, floor });
    setRoom(null);
    const info = infoOf(id);
    const f = frameOf(info.b.pts);
    const S = Math.max(f.L, f.W);
    const y = floorBase(floor);
    fly([f.cx - S * 0.35, y + S * 1.05 + 4, f.cz + S * 0.85], [f.cx, y + 1, f.cz]);
  };

  const resetModes = () => {
    setRide(null);
    setWelcome(false);
    setPicked(null);
    setSmall(null);
    setRoom(null);
  };

  const goStop = (i: number) => {
    resetModes();
    setIdx(i);
    setCladSel(null);
    const s = TOUR[i];
    if (s.cut) showCut(s.cut.id, s.cut.floor);
    else {
      setCut(null);
      fly(s.cam, s.target);
    }
    whoosh(0.5);
    setTimeout(() => chime(1.2), 650);
  };

  const pickBuilding = (i: number) => {
    const info = data.infos[i];
    resetModes();
    setPlaying(false);
    setIdx(-1);
    setCut(null);
    setCladSel(null);
    setPicked(i);
    const [x, z] = info.b.c;
    const d = 22 + Math.sqrt(info.b.area) * 0.8;
    fly([x - d * 0.6, info.spec.height + d * 0.55, z + d], [x, info.spec.height * 0.5, z]);
    pop();
  };

  const pickClad = (id: number) => {
    resetModes();
    setPlaying(false);
    setIdx(-1);
    setCut(null);
    setCladSel(id);
    const info = infoOf(id);
    const spec = cladById.get(id)!;
    const h = floorBase(spec.floors.length);
    const side = spec.face === "north" ? -1 : 1; // view the building from its front
    fly([info.b.c[0] - 8, h * 0.7, info.b.c[1] + side * (h + 20)], [info.b.c[0], h * 0.45, info.b.c[1]]);
    pop();
  };

  const startWalk = (at?: WalkState) => {
    setSay(null);
    resetModes();
    setPlaying(false);
    setIdx(-1);
    setCut(null);
    setCladSel(null);
    walkRef.current = at ?? { ...WALK_SPAWN, pitch: 0, building: null, floor: 0 };
    setWalkWhere({ building: walkRef.current.building, floor: walkRef.current.floor });
    setWalk(true);
    whoosh(0.4);
  };

  const stopWalk = () => {
    setWalk(false);
    setGuideVoice(false);
    setGuideVoice(voice);
    const cam = cc.current?.camera as THREE.PerspectiveCamera | undefined;
    if (cam) {
      cam.fov = 45;
      cam.near = 0.5;
      cam.updateProjectionMatrix();
    }
    const s = walkRef.current;
    if (cc.current) void cc.current.setLookAt(s.x - 25, 30, s.z + 35, s.x, 2, s.z, false);
  };

  const takeLift = (floor: number) => {
    const s = walkRef.current;
    if (s.building == null) return;
    liftTo(s, s.building, floor);
    setWalkWhere({ building: s.building, floor });
    chime(1 + floor * 0.08);
  };

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (idx >= TOUR.length - 1) setPlaying(false);
      else goStop(idx + 1);
    }, idx < 0 ? 300 : STOP_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, idx]);

  const explore = () => {
    resetModes();
    setPlaying(false);
    setIdx(-1);
    setCut(null);
    setCladSel(null);
    fly(OVERVIEW.slice(0, 3) as [number, number, number], OVERVIEW.slice(3) as [number, number, number], false);
  };

  useEffect(() => {
    if (walk) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goStop(Math.min(TOUR.length - 1, idx + 1));
      if (e.key === "ArrowLeft") goStop(Math.max(0, idx - 1));
      if (e.key === " ") setPlaying((p) => !p);
      if (e.key === "Escape") explore();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const stop = idx >= 0 ? TOUR[idx] : null;
  const hovered = hover != null ? data.infos[hover] : null;
  const pickedInfo = picked != null ? data.infos[picked] : null;
  const cutSpec = cut ? cladById.get(cut.id)! : null;
  const selSpec = cladSel != null ? cladById.get(cladSel)! : null;
  const walkSpec = walk && walkWhere.building != null ? cladById.get(walkWhere.building)! : null;

  const modeFor = (id: number): ViewMode => {
    if (walk && walkWhere.building === id) return { type: "walk", floor: walkWhere.floor };
    if (cut && cut.id === id) return { type: "cut", floor: cut.floor };
    return { type: "full" };
  };

  return (
    <div ref={rootRef} className={`absolute inset-0 ${hover != null && !walk ? "cursor-pointer" : ""} ${walk ? "cursor-grab" : ""}`}>
      <Canvas shadows dpr={[1, 1.75]} camera={{ fov: 45, near: 0.5, far: 3000, position: [15, 650, 2] }}>
        <Sky sunPosition={[140, 70, 60]} turbidity={7} rayleigh={1.5} mieCoefficient={0.006} />
        <fog attach="fog" args={["#d8c9ab", 280, 1000]} />
        <hemisphereLight args={["#fff4dc", "#6b5a3a", 0.75]} />
        <directionalLight
          position={[160, 190, 80]}
          intensity={2.5}
          color="#fff0d0"
          castShadow
          shadow-mapSize={[4096, 4096]}
          shadow-camera-left={-220}
          shadow-camera-right={220}
          shadow-camera-top={220}
          shadow-camera-bottom={-220}
          shadow-camera-far={700}
          shadow-bias={-0.0003}
          shadow-normalBias={0.04}
        />
        {walkSpec && <pointLight position={[walkRef.current.x, floorBase(walkWhere.floor) + 3, walkRef.current.z]} intensity={25} distance={30} color="#fff6e6" />}
        <Ground />
        <Roads />
        <Buildings data={data} onHover={setHover} onPick={pickBuilding} />
        {CLAD.map((spec) => (
          <CladBuilding key={spec.id} info={infoOf(spec.id)} spec={spec} mode={modeFor(spec.id)} highlight={cladSel === spec.id || stop?.id === spec.key} onPick={() => !walk && pickClad(spec.id)} hideLabel={walk} />
        ))}
        {cut && cutSpec && <Interior info={infoOf(cut.id)} spec={cutSpec} floor={cut.floor} wallH={1.6} activeRoom={room?.name ?? null} onRoom={setRoom} />}
        {walkSpec && walkWhere.building != null && (
          <Interior info={infoOf(walkWhere.building)} spec={walkSpec} floor={walkWhere.floor} wallH={(walkWhere.floor === 0 ? GROUND_H : FLOOR_H) - 0.08} activeRoom={room?.name ?? null} onRoom={setRoom} />
        )}
        <Forecourt walk={walk} onPick={(sb) => (resetModes(), setSmall(sb))} />
        <BuildingLabels infos={data.infos} onPick={pickBuilding} active={picked} />
        <Highlight info={pickedInfo ?? (walk ? null : hovered)} />
        <Poles />
        <Mast />
        <RoadSigns />
        <Life onPop={onPop} onRide={setRide} riding={!!ride} />
        <Birds onPop={onPop} />
        <CameraControls
          ref={cc}
          makeDefault
          enabled={!walk}
          minDistance={4}
          maxDistance={700}
          maxPolarAngle={Math.PI / 2.05}
          onStart={() => {
            if (ride) setRide(null);
          }}
        />
        <RideCam cc={cc} target={ride} />
        {walk && <WalkController state={walkRef} onEnterExit={(b) => setWalkWhere({ building: b, floor: 0 })} />}
        {walk && <GuideBrain walk={walkRef} hud={guideHud} onSay={(g) => (setSay(g), setGuideOpen(true))} onDone={() => onPop("🎓 Walking tour complete. Keep exploring!")} />}
      </Canvas>
      <div className="landing-fade pointer-events-none absolute inset-0 bg-[#fff4dc]" />

      <header className="absolute inset-x-0 top-0 z-50 flex items-center justify-between gap-3 bg-gradient-to-b from-black/45 to-transparent px-5 py-4 md:px-8">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/ugc-crest.png" alt="UGC crest" className="h-10 w-10 rounded-full ring-1 ring-[#d1aa66]/60" />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-wide text-white">University of Gold Coast</p>
            <p className="text-[11px] text-white/70">Milton St area, Baatsona · Spintex, Accra</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="chip" onClick={onBack}>← Globe</button>
          {walk ? (
            <button className="chip chip-gold" onClick={stopWalk}>✕ Exit walk</button>
          ) : (
            <>
              <button className="chip" onClick={() => startWalk()}>🚶 Walk in</button>
              <button className="chip" onClick={explore}>Explore</button>
              <button className="chip chip-gold" onClick={() => (playing ? setPlaying(false) : (setWelcome(false), setPlaying(true)))}>
                {playing ? "❚❚ Pause" : "▶ Tour"}
              </button>
            </>
          )}
        </div>
      </header>

      {welcome && !walk && (
        <div className="welcome absolute z-50 left-1/2 top-1/2 w-[min(92vw,500px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/20 bg-[#0a0a0a]/80 p-7 text-center text-white backdrop-blur-xl">
          <p className="text-[11px] tracking-[0.3em] text-[#d1aa66]">YOU HAVE LANDED</p>
          <h2 className="mt-2 font-display text-3xl">Akwaaba to UGC</h2>
          <p className="mt-3 text-sm text-white/75">
            Walk in through the gate past Student Services into the Main Campus, then across the lane to the Gold Coast Hall and the cafeteria. Take the lift between floors, or take the guided tour.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button className="chip chip-gold" onClick={() => startWalk()}>🚶 Walk in from the gate</button>
            <button className="chip" onClick={() => (setWelcome(false), setPlaying(true))}>▶ Guided tour</button>
            <button className="chip" onClick={() => setWelcome(false)}>Explore freely</button>
          </div>
        </div>
      )}

      {/* guided tour card */}
      {stop && !walk && (
        <aside key={stop.id} className="panel absolute z-50 right-4 top-24 w-[min(92vw,370px)] rounded-3xl border border-white/15 bg-[#0a0a0a]/80 p-6 text-white backdrop-blur-xl md:right-8">
          <p className="text-[11px] tracking-[0.25em] text-[#d1aa66]">{stop.kicker.toUpperCase()}</p>
          <h3 className="mt-2 font-display text-2xl leading-tight">{stop.name}</h3>
          <p className="mt-3 text-sm leading-relaxed text-white/80">{stop.blurb}</p>
          <ul className="mt-4 space-y-1.5">
            {stop.facts.map((f) => (
              <li key={f} className="flex gap-2 text-[13px] text-white/85">
                <span className="text-[#d1aa66]">◆</span>
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-center justify-between">
            <button className="chip" disabled={idx === 0} onClick={() => goStop(idx - 1)}>← Prev</button>
            <span className="text-xs text-white/50">{idx + 1} / {TOUR.length}</span>
            <button className="chip chip-gold" onClick={() => (idx < TOUR.length - 1 ? goStop(idx + 1) : explore())}>
              {idx < TOUR.length - 1 ? "Next →" : "Finish"}
            </button>
          </div>
          {playing && <div key={`p${idx}`} className="progress mt-4 h-0.5 rounded bg-[#d1aa66]" style={{ animationDuration: `${STOP_MS}ms` }} />}
        </aside>
      )}

      {/* clad building card: walk in or pick a floor */}
      {selSpec && !walk && !stop && (
        <aside key={selSpec.id} className="panel absolute z-50 right-4 top-24 w-[min(92vw,340px)] rounded-3xl border border-white/15 bg-[#0a0a0a]/85 p-6 text-white backdrop-blur-xl md:right-8">
          <p className="text-[11px] tracking-[0.25em] text-[#d1aa66]">{selSpec.key === "main" ? "MAIN CAMPUS" : "CONFERENCE HALL"}</p>
          <h3 className="mt-2 font-display text-2xl leading-tight">{selSpec.title}</h3>
          <button className="chip chip-gold mt-4 w-full" onClick={() => startWalk(frontOf(selSpec.id))}>🚶 Walk in through the entrance</button>
          <p className="mt-4 text-[11px] tracking-[0.2em] text-white/50">LOOK INSIDE A FLOOR</p>
          <div className="mt-2 space-y-1">
            {[...selSpec.floors].map((fl, i) => ({ fl, i })).reverse().map(({ fl, i }) => (
              <button key={i} className="floor-btn" onClick={() => showCut(selSpec.id, i)}>
                <b>{fl.short}</b>
                <span>{fl.name}</span>
              </button>
            ))}
          </div>
        </aside>
      )}

      {/* cutaway floor picker */}
      {cut && cutSpec && !walk && (
        <aside className="panel absolute z-50 left-4 top-24 w-[min(80vw,270px)] rounded-3xl border border-white/15 bg-[#0a0a0a]/85 p-4 text-white backdrop-blur-xl md:left-8">
          <p className="text-[11px] tracking-[0.2em] text-[#d1aa66]">{cutSpec.title.toUpperCase()}</p>
          <div className="mt-2 space-y-1">
            {[...cutSpec.floors].map((fl, i) => ({ fl, i })).reverse().map(({ fl, i }) => (
              <button key={i} className={`floor-btn ${cut.floor === i ? "on" : ""}`} onClick={() => showCut(cut.id, i)}>
                <b>{fl.short}</b>
                <span>{fl.name}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              className="chip chip-gold flex-1"
              onClick={() => {
                const s: WalkState = { x: 0, z: 0, yaw: 0, pitch: 0, building: null, floor: 0 };
                liftTo(s, cut.id, cut.floor);
                startWalk(s);
              }}
            >
              🚶 Walk this floor
            </button>
            <button className="chip" onClick={explore}>Exit</button>
          </div>
          <p className="mt-3 text-[10px] text-white/45">Room layout is illustrative</p>
        </aside>
      )}

      {/* walk HUD + lift */}
      {walk && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-20 z-40 -translate-x-1/2 rounded-full bg-black/45 px-4 py-1.5 text-[11px] text-white/75 backdrop-blur">
            <b className="text-[#d1aa66]">Move the mouse</b> to look · <b className="text-[#d1aa66]">scroll</b> / arrows to walk · <b className="text-[#d1aa66]">click</b> the ground to go there · <b className="text-[#d1aa66]">drag</b> to turn
          </div>
          {/* live tour guide */}
          <div className="guide-card absolute bottom-4 left-1/2 z-50 w-[min(94vw,560px)] -translate-x-1/2 rounded-2xl border border-[#d1aa66]/40 bg-[#0a0a0a]/88 p-4 text-white backdrop-blur-xl">
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/ugc-crest.png" alt="" className="h-11 w-11 shrink-0 rounded-full ring-1 ring-[#d1aa66]/70" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] tracking-[0.2em] text-[#d1aa66]">{(say?.title ?? "YOUR UGC GUIDE").toUpperCase()}</p>
                  <div className="flex shrink-0 gap-1">
                    <button
                      className="chip !px-2 !py-0.5 !text-[11px]"
                      onClick={() => {
                        setGuideVoice(!voice);
                        setVoice(!voice);
                      }}
                    >
                      {voice ? "🔊 Voice" : "🔇 Voice"}
                    </button>
                    <button className="chip !px-2 !py-0.5 !text-[11px]" onClick={() => setGuideOpen((o) => !o)}>
                      {guideOpen ? "–" : "+"}
                    </button>
                  </div>
                </div>
                {guideOpen && say && <p key={say.line} className="guide-line mt-1 text-[13px] leading-relaxed text-white/85">{say.line}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                  <span className="flex items-center gap-2 text-[#e3c690]">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-[#d1aa66]/15">
                      <span ref={guideHud.arrow} className="guide-arrow inline-block">▲</span>
                    </span>
                    Next: <b ref={guideHud.next} className="font-semibold" /> <span ref={guideHud.dist} className="text-white/60" />
                  </span>
                  <span className="text-white/60">
                    👁 Looking at: <span ref={guideHud.looking} className="text-white/85" />
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-white/45">
                  {walkSpec ? `${walkSpec.title} · ${walkSpec.floors[walkWhere.floor].name}` : "Outside · walk through an entrance to go in"}
                </p>
              </div>
            </div>
          </div>
          {walkSpec && (
            <aside className="panel absolute right-4 top-24 z-50 w-[min(80vw,260px)] rounded-3xl border border-white/15 bg-[#0a0a0a]/85 p-4 text-white backdrop-blur-xl md:right-8">
              <p className="text-[11px] tracking-[0.2em] text-[#d1aa66]">🛗 LIFT · {walkSpec.title.toUpperCase()}</p>
              <div className="mt-2 space-y-1">
                {[...walkSpec.floors].map((fl, i) => ({ fl, i })).reverse().map(({ fl, i }) => (
                  <button key={i} className={`floor-btn ${walkWhere.floor === i ? "on" : ""}`} onClick={() => takeLift(i)}>
                    <b>{fl.short}</b>
                    <span>{fl.name}</span>
                  </button>
                ))}
              </div>
              {walkWhere.floor !== 0 && <p className="mt-2 text-[10px] text-white/50">Take the lift to G to walk back outside.</p>}
            </aside>
          )}
        </>
      )}

      {room && (
        <div className="panel absolute bottom-24 left-1/2 z-50 w-[min(92vw,380px)] -translate-x-1/2 rounded-2xl border border-white/15 bg-[#0a0a0a]/90 p-4 text-white backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] tracking-[0.2em] text-[#d1aa66]">ROOM</p>
              <h4 className="font-display text-lg">{room.name}</h4>
              {room.note && <p className="mt-1 text-[13px] text-white/75">{room.note}</p>}
            </div>
            <button className="chip" onClick={() => setRoom(null)}>✕</button>
          </div>
        </div>
      )}

      {small && !walk && (
        <aside className="panel absolute right-4 top-24 z-50 w-[min(92vw,320px)] rounded-3xl border border-white/15 bg-[#0a0a0a]/85 p-6 text-white backdrop-blur-xl md:right-8">
          <p className="text-[11px] tracking-[0.25em] text-[#d1aa66]">ON CAMPUS</p>
          <h3 className="mt-2 font-display text-xl">{small.name}</h3>
          <p className="mt-2 text-[13px] text-white/80">{small.note}</p>
          <button className="chip mt-4" onClick={() => setSmall(null)}>Close</button>
        </aside>
      )}

      {pickedInfo && !stop && !walk && (
        <aside key={pickedInfo.b.id} className="panel absolute z-50 right-4 top-24 w-[min(92vw,340px)] rounded-3xl border border-white/15 bg-[#0a0a0a]/80 p-6 text-white backdrop-blur-xl md:right-8">
          <p className="text-[11px] tracking-[0.25em] text-[#d1aa66]">BUILDING</p>
          <h3 className="mt-2 font-display text-xl leading-tight">{pickedInfo.b.name ?? "Building on the block"}</h3>
          <ul className="mt-3 space-y-1.5 text-[13px] text-white/85">
            <li>◆ Footprint: about {pickedInfo.b.area.toLocaleString()} m² (OpenStreetMap)</li>
            <li>◆ Storeys: {pickedInfo.b.levels ?? `${pickedInfo.spec.levels} (estimated)`}</li>
            <li>◆ Roof: {pickedInfo.spec.roof === "flat" ? "flat concrete deck with water tanks" : `${pickedInfo.spec.roof === "hip" ? "hipped" : "gabled"} long-span metal sheets`}</li>
          </ul>
          <button className="chip mt-5" onClick={explore}>Close</button>
        </aside>
      )}

      {hovered && !stop && !pickedInfo && !walk && !cut && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-50 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-sm text-white backdrop-blur">
          {hovered.b.name ?? `${hovered.spec.levels}-storey building`} · click to look closer
        </div>
      )}

      {skyHint && !walk && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-50 -translate-x-1/2 rounded-full border border-[#d1aa66]/50 bg-black/70 px-4 py-2 text-sm text-[#e3c690] backdrop-blur">
          Keep scrolling out to rise into the sky and return to the globe ↑
        </div>
      )}

      {ride && (
        <div className="absolute left-1/2 top-24 z-50 -translate-x-1/2 rounded-full bg-[#d1aa66] px-4 py-2 text-sm font-semibold text-black">
          🚐 Riding the trotro · drag the view to hop off
        </div>
      )}

      {!walk && (
        <nav className="dock absolute inset-x-0 bottom-4 z-50 mx-auto flex w-max max-w-[96vw] gap-1.5 overflow-x-auto rounded-full border border-white/15 bg-black/45 p-1.5 backdrop-blur-xl">
          {TOUR.map((s, i) => (
            <button key={s.id} onClick={() => goStop(i)} className={`dock-item ${i === idx ? "on" : ""}`} title={s.name}>
              <b>{i + 1}</b>
            </button>
          ))}
        </nav>
      )}
      <p className="pointer-events-none absolute bottom-16 right-4 z-40 text-[10px] text-white/60">Buildings & streets © OpenStreetMap contributors · names from Google Maps · interiors illustrative</p>
    </div>
  );
}
