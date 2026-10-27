"use client";

import { useState } from "react";
import AcademicBackdrop from "./AcademicBackdrop";

const LINE_1 = "Ready to explore";
const LINE_2 = "the Gold Coast?";

function Letters({ text, delay, className }: { text: string; delay: number; className?: string }) {
  let n = 0;
  return (
    <span className={className} aria-label={text}>
      {text.split(" ").map((word, w) => (
        <span key={w} className="inline-block whitespace-nowrap">
          {w > 0 && " "}
          {word.split("").map((ch) => (
            <span key={n} aria-hidden className="ltr" style={{ animationDelay: `${delay + n++ * 0.045}s` }}>
              {ch}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

export default function Intro({ onStart }: { onStart: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const go = () => {
    setLeaving(true);
    setTimeout(onStart, 900);
  };
  return (
    <div className={`intro fixed inset-0 z-50 overflow-hidden ${leaving ? "intro-leave" : ""}`}>
      <AcademicBackdrop />
      <header className="fade-up absolute inset-x-0 top-0 flex flex-col items-center gap-2 px-6 pt-6 md:pt-8" style={{ animationDelay: "0.1s" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/ugc-logo.png" alt="University of Gold Coast · Accra Business School" className="h-16 w-auto md:h-24" />
        <span className="text-[10px] tracking-[0.35em] text-[#f0dcb4]/55 md:text-xs">VIRTUAL CAMPUS TOUR</span>
      </header>

      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="fade-up mb-8 text-[11px] tracking-[0.35em] text-[#d1aa66]/80 md:text-xs" style={{ animationDelay: "0.2s" }}>
          BORN FOR COMMERCE · BUILT FOR INDUSTRY · SPINTEX ROAD, ACCRA
        </p>
        <h1 className="font-display text-5xl leading-[1.05] text-white md:text-8xl">
          <Letters text={LINE_1} delay={0.5} />
          <br />
          <Letters text={LINE_2} delay={1.3} className="text-glow" />
        </h1>
        <button
          onClick={go}
          className="fade-up cta mt-12 rounded-full border border-[#d1aa66]/60 bg-gradient-to-b from-[#2a2112]/60 to-black/60 px-9 py-4 text-sm font-semibold tracking-wide text-[#f7ecd6]"
          style={{ animationDelay: "2.3s" }}
        >
          Yes, take me there →
        </button>
        <p className="fade-up mt-5 text-xs text-white/45" style={{ animationDelay: "2.6s" }}>
          Sound on · scroll to zoom from space to campus · drag &amp; click anything
        </p>
      </div>
    </div>
  );
}
