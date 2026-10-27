"use client";

import { useEffect, useRef } from "react";
import { JOY } from "@/lib/joystick";

/** On-screen thumbstick for walk mode on phones and tablets: up/down walks, left/right turns. */
export default function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const id = useRef<number | null>(null);

  useEffect(() => {
    const el = base.current!;
    const R = 46;
    const set = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      let dx = cx - (r.left + r.width / 2);
      let dy = cy - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      JOY.x = dx / R;
      JOY.y = dy / R;
      if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const down = (e: PointerEvent) => {
      e.stopPropagation();
      id.current = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // synthetic or already-released pointers cannot be captured; dragging still works
      }
      JOY.active = true;
      set(e.clientX, e.clientY);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId === id.current) set(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id.current) return;
      id.current = null;
      JOY.active = false;
      JOY.x = 0;
      JOY.y = 0;
      if (knob.current) knob.current.style.transform = "translate(0px, 0px)";
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      JOY.active = false;
      JOY.x = 0;
      JOY.y = 0;
    };
  }, []);

  return (
    <div ref={base} className="joystick" aria-label="Walk joystick" role="application">
      <div ref={knob} className="joystick-knob" />
    </div>
  );
}
