"use client";

import { useEffect, useRef } from "react";

type Kind = "cap" | "book" | "quill" | "bulb" | "chart" | "text";
const WORDS = ["MBA", "MSc", "ATHE", "PhD", "M.A", "ECBA", "LLM", "Dual MBA", "BSc", "Level 6"];

/** Gold line-art of academic symbols, drawn around (0,0) at unit size s. */
function drawIcon(ctx: CanvasRenderingContext2D, kind: Kind, s: number, word: string) {
  ctx.beginPath();
  switch (kind) {
    case "cap": // mortarboard with tassel
      ctx.moveTo(-s, 0);
      ctx.lineTo(0, -s * 0.5);
      ctx.lineTo(s, 0);
      ctx.lineTo(0, s * 0.5);
      ctx.closePath();
      ctx.moveTo(-s * 0.55, s * 0.28);
      ctx.lineTo(-s * 0.55, s * 0.75);
      ctx.quadraticCurveTo(0, s * 1.05, s * 0.55, s * 0.75);
      ctx.lineTo(s * 0.55, s * 0.28);
      ctx.moveTo(s * 0.8, s * 0.1);
      ctx.lineTo(s * 0.8, s * 0.7);
      break;
    case "book": // open book
      ctx.moveTo(0, -s * 0.45);
      ctx.quadraticCurveTo(-s * 0.5, -s * 0.7, -s, -s * 0.45);
      ctx.lineTo(-s, s * 0.55);
      ctx.quadraticCurveTo(-s * 0.5, s * 0.3, 0, s * 0.55);
      ctx.quadraticCurveTo(s * 0.5, s * 0.3, s, s * 0.55);
      ctx.lineTo(s, -s * 0.45);
      ctx.quadraticCurveTo(s * 0.5, -s * 0.7, 0, -s * 0.45);
      ctx.lineTo(0, s * 0.55);
      break;
    case "quill":
      ctx.moveTo(-s * 0.8, s);
      ctx.quadraticCurveTo(-s * 0.1, -s * 0.2, s * 0.8, -s);
      ctx.quadraticCurveTo(s * 0.2, -s * 0.1, -s * 0.2, s * 0.3);
      ctx.moveTo(-s * 0.8, s);
      ctx.lineTo(-s * 0.35, s * 0.5);
      break;
    case "bulb":
      ctx.arc(0, -s * 0.2, s * 0.6, Math.PI * 0.8, Math.PI * 2.2);
      ctx.lineTo(s * 0.25, s * 0.55);
      ctx.lineTo(-s * 0.25, s * 0.55);
      ctx.closePath();
      ctx.moveTo(-s * 0.22, s * 0.75);
      ctx.lineTo(s * 0.22, s * 0.75);
      break;
    case "chart":
      ctx.moveTo(-s, s * 0.8);
      ctx.lineTo(s, s * 0.8);
      ctx.rect(-s * 0.75, s * 0.2, s * 0.3, s * 0.6);
      ctx.rect(-s * 0.15, -s * 0.2, s * 0.3, s);
      ctx.rect(s * 0.45, -s * 0.7, s * 0.3, s * 1.5);
      break;
    case "text":
      ctx.font = `italic 600 ${s * 1.4}px Georgia, serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(word, 0, 0);
      return;
  }
  ctx.stroke();
}

/**
 * Academic backdrop for the intro: gold line-art (caps, books, quills, charts and business notation)
 * drifting upward, linked into a faint "knowledge network", easing away from the cursor, over
 * ruled-paper lines with the UGC seal slowly turning behind the headline.
 */
export default function AcademicBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const resize = () => {
      w = c.width = window.innerWidth * dpr;
      h = c.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);
    const mouse = { x: -1e4, y: -1e4 };
    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX * dpr;
      mouse.y = e.clientY * dpr;
    };
    window.addEventListener("pointermove", onMove);
    const kinds: Kind[] = ["cap", "book", "quill", "bulb", "chart", "text", "text"];
    const count = Math.round(Math.max(24, Math.min(70, (w * h) / (dpr * dpr * 18000))));
    const ps = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: 0,
      vy: -(0.08 + Math.random() * 0.25) * dpr,
      s: (8 + Math.random() * 14) * dpr,
      rot: (Math.random() - 0.5) * 0.6,
      spin: (Math.random() - 0.5) * 0.002,
      depth: 0.35 + Math.random() * 0.65,
      kind: kinds[Math.floor(Math.random() * kinds.length)],
      word: WORDS[Math.floor(Math.random() * WORDS.length)],
    }));
    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      // ruled-paper lines and a margin rule
      ctx.strokeStyle = "rgba(209,170,102,0.045)";
      ctx.lineWidth = dpr;
      for (let y = 40 * dpr; y < h; y += 34 * dpr) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(209,170,102,0.08)";
      ctx.beginPath();
      ctx.moveTo(w * 0.08, 0);
      ctx.lineTo(w * 0.08, h);
      ctx.stroke();

      for (const p of ps) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < (160 * dpr) ** 2) {
          const f = 0.35 / Math.max(Math.sqrt(d2), 1);
          p.vx += dx * f;
          p.y += dy * f * 0.5;
        }
        p.vx *= 0.95;
        p.x += p.vx;
        p.y += p.vy * p.depth;
        p.rot += p.spin;
        if (p.y < -40 * dpr) {
          p.y = h + 40 * dpr;
          p.x = Math.random() * w;
        }
      }
      // knowledge network between nearby symbols
      const link = 150 * dpr;
      ctx.lineWidth = dpr * 0.8;
      for (let i = 0; i < ps.length; i++)
        for (let j = i + 1; j < ps.length; j++) {
          const a = ps[i];
          const b = ps[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > link) continue;
          ctx.strokeStyle = `rgba(209,170,102,${0.16 * (1 - d / link) * Math.min(a.depth, b.depth)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      for (const p of ps) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const alpha = 0.18 + p.depth * 0.45;
        ctx.strokeStyle = `rgba(209,170,102,${alpha})`;
        ctx.fillStyle = `rgba(209,170,102,${alpha})`;
        ctx.lineWidth = 1.4 * dpr;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        drawIcon(ctx, p.kind, p.s * p.depth, p.word);
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);
  return (
    <>
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/ugc-crest.png" alt="" aria-hidden className="seal-watermark" />
    </>
  );
}
