import { describe, expect, it } from "vitest";
import { boxesOverlap, pushOutOfBox, resolveCircle, toSeg, type Box } from "@/lib/collision";

describe("resolveCircle", () => {
  const wall = [toSeg([[0, 0], [10, 0]])];

  it("pushes a circle out of a wall it overlaps", () => {
    const [x, z] = resolveCircle(5, 0.1, wall, 0.3);
    expect(x).toBeCloseTo(5);
    expect(z).toBeCloseTo(0.3);
  });

  it("leaves a circle that is clear of the wall alone", () => {
    expect(resolveCircle(5, 2, wall, 0.3)).toEqual([5, 2]);
  });
});

describe("boxes", () => {
  const car: Box = { x: 0, z: 0, yaw: 0, hl: 2.25, hw: 0.9 };

  it("detects overlapping and separate rectangles", () => {
    expect(boxesOverlap(car, { ...car, z: 3 })).toBe(true); // nose-to-tail, overlapping
    expect(boxesOverlap(car, { ...car, z: 6 })).toBe(false);
    expect(boxesOverlap(car, { ...car, x: 2.5 })).toBe(false); // side by side in the next lane
  });

  it("handles rotated rectangles", () => {
    expect(boxesOverlap(car, { x: 0, z: 0, yaw: Math.PI / 2, hl: 2.25, hw: 0.9 })).toBe(true);
    expect(boxesOverlap(car, { x: 4, z: 4, yaw: Math.PI / 4, hl: 2.25, hw: 0.9 })).toBe(false);
  });

  it("pushes a person out of a car", () => {
    const out = pushOutOfBox(0.2, 0, 0.3, car);
    expect(out).not.toBeNull();
    expect(pushOutOfBox(out![0], out![1], 0.29, car)).toBeNull();
    expect(pushOutOfBox(5, 5, 0.3, car)).toBeNull();
  });
});
