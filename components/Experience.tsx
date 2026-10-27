"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import Intro from "./Intro";
import { initAudio, isMuted, setMuted, whoosh } from "@/lib/sfx";
import { labelRoot } from "@/lib/labelRoot";

const GlobeStage = dynamic(() => import("./GlobeStage"), { ssr: false, loading: () => <Loading label="Charting the globe…" /> });
const CampusStage = dynamic(() => import("./CampusStage"), { ssr: false, loading: () => <Loading label="Raising the campus…" /> });

function Loading({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-[#050505] text-sm tracking-[0.3em] text-[#e3c690]/70">
      {label.toUpperCase()}
    </div>
  );
}

type Stage = "intro" | "globe" | "campus";

export default function Experience() {
  const [stage, setStage] = useState<Stage>("intro");
  const [fromCampus, setFromCampus] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const onPop = useCallback((msg: string) => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), msg });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const start = () => {
    initAudio();
    whoosh(1);
    setStage("globe");
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#050505]">
      <div
        className="label-root pointer-events-none fixed inset-0 z-[5] overflow-hidden"
        ref={(el) => {
          if (el) labelRoot.current = el;
        }}
      />
      {stage === "intro" && <Intro onStart={start} />}
      {stage === "globe" && <GlobeStage key={String(fromCampus)} startZ={fromCampus ? 4.85 : undefined} onEnter={() => setStage("campus")} onPop={onPop} />}
      {stage === "campus" && (
        <CampusStage
          onBack={() => {
            setFromCampus(true);
            setStage("globe");
          }}
          onPop={onPop}
        />
      )}

      {stage !== "intro" && (
        <>
          <button
            className="sound-btn"
            onClick={() => {
              setMuted(!isMuted());
              setMutedState(isMuted());
            }}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          {stage === "globe" && (
            <button className="skip-btn" onClick={() => setStage("campus")}>
              Skip to campus →
            </button>
          )}
        </>
      )}

      {toast && (
        <div key={toast.id} className="toast">
          {toast.msg}
        </div>
      )}

    </main>
  );
}
