import { describe, expect, it } from "vitest";
import { HALL_ID, MAIN_ID, WALK_SPAWN, cladById } from "@/lib/campus";
import { outsideSegments, resolveCircle } from "@/lib/collision";
import { frontEdge } from "@/lib/interiorLayout";
import { lane, pointInPoly, type XZ } from "@/lib/laneGeometry";

/** Walk from the street through the gate along waypoints, colliding with every wall like the visitor does. */
function walk(points: XZ[]) {
  const segs = outsideSegments();
  let [x, z] = [WALK_SPAWN.x, WALK_SPAWN.z];
  for (const [tx, tz] of points) {
    for (let i = 0; i < 4000; i++) {
      const dx = tx - x;
      const dz = tz - z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) break;
      const step = Math.min(0.08, d);
      [x, z] = resolveCircle(x + (dx / d) * step, z + (dz / d) * step, segs, 0.32);
    }
  }
  return [x, z] as XZ;
}

const inside = (id: number, [x, z]: XZ) => pointInPoly(x, z, lane.buildings.find((b) => b.id === id)!.pts);
const doorway = (id: number, face: "south" | "north" | "west" | "east", near?: XZ) => {
  const e = frontEdge(lane.buildings.find((b) => b.id === id)!.pts, face, near);
  const mx = (e.a[0] + e.b[0]) / 2;
  const mz = (e.a[1] + e.b[1]) / 2;
  return { out: [mx + e.nx * 2.5, mz + e.nz * 2.5] as XZ, in: [mx - e.nx * 2.5, mz - e.nz * 2.5] as XZ };
};

describe("walking routes (walls block, doorways let you through)", () => {
  it("cannot walk straight through the front fence", () => {
    // heading north from the street but 8 m west of the gate opening: the slatted fence stops you
    const end = walk([[-8, 15], [-8, 4]]);
    expect(end[1]).toBeGreaterThan(9.5);
  });

  it("walks from the gate into the Main Campus through its entrance", () => {
    const spec = cladById.get(MAIN_ID)!;
    const d = doorway(MAIN_ID, spec.face, spec.frontNear);
    expect(inside(MAIN_ID, walk([[2.5, 8], d.out, d.in]))).toBe(true);
  });

  it("walks into the Gold Coast Hall through the north entrance", () => {
    const d = doorway(HALL_ID, "north");
    expect(inside(HALL_ID, walk([[2.5, 8], d.out, d.in]))).toBe(true);
  });

  it("walks into the Gold Coast Hall through the west entrance", () => {
    const d = doorway(HALL_ID, "west", [18, 9]);
    expect(inside(HALL_ID, walk([[2.5, 8], [10, 12], d.out, d.in]))).toBe(true);
  });

  it("cannot walk into the Hall through a solid wall", () => {
    // straight at the middle of the south wall from Milton Street side
    const end = walk([[2.5, 8], [10, 40], [32, 40], [32, 20]]);
    expect(inside(HALL_ID, end)).toBe(false);
  });
});
