import { describe, expect, it } from "vitest";
import { CAFETERIA, CLAD, HALL_ID, MAIN_ID, STUDENT_SERVICES, cladById, entrancesOf } from "@/lib/campus";
import { exteriorSegments, frontEdge } from "@/lib/interiorLayout";
import { lane, pointInPoly, type XZ } from "@/lib/laneGeometry";
import { TOUR } from "@/lib/tour";

const polyOf = (id: number) => lane.buildings.find((b) => b.id === id)!.pts;
const overlaps = (a: XZ[], b: XZ[]) => a.some(([x, z]) => pointInPoly(x, z, b)) || b.some(([x, z]) => pointInPoly(x, z, a));
const centre = (pts: XZ[]): XZ => [pts.reduce((t, p) => t + p[0], 0) / pts.length, pts.reduce((t, p) => t + p[1], 0) / pts.length];

describe("campus layout", () => {
  it("has both clad UGC buildings on the map", () => {
    for (const c of CLAD) expect(lane.buildings.some((b) => b.id === c.id)).toBe(true);
  });

  it("places the cafeteria beside the Hall and Student Services far away by the gate", () => {
    const [cx, cz] = centre(CAFETERIA.pts);
    const [sx, sz] = centre(STUDENT_SERVICES.pts);
    expect(Math.hypot(cx - sx, cz - sz)).toBeGreaterThan(30);
    const hall = polyOf(HALL_ID);
    const nearHall = CAFETERIA.pts.some(([x, z]) => hall.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < 2));
    expect(nearHall).toBe(true);
  });

  it("never lets the small campus buildings overlap any other building", () => {
    for (const sb of [CAFETERIA, STUDENT_SERVICES]) {
      for (const b of lane.buildings) expect(overlaps(sb.pts, b.pts), `${sb.name} overlaps ${b.id}`).toBe(false);
    }
  });

  it("gives the Hall two entrances (north onto the lane, west toward the gate) and the Main Campus one", () => {
    const hall = cladById.get(HALL_ID)!;
    expect(entrancesOf(hall).map((e) => e.face)).toEqual(["north", "west"]);
    const west = frontEdge(polyOf(HALL_ID), "west", [18, 9]);
    expect(west.nx).toBeLessThan(-0.7);
    expect(Math.min(west.a[1], west.b[1])).toBeLessThan(12); // north end of the west face
    expect(entrancesOf(cladById.get(MAIN_ID)).length).toBe(1);
  });

  it("cuts a doorway into the wall for every entrance", () => {
    for (const c of CLAD) {
      const pts = polyOf(c.id);
      expect(exteriorSegments(pts, entrancesOf(c)).length).toBe(pts.length + entrancesOf(c).length);
    }
  });

  it("only uses floors that exist in tour cutaways", () => {
    for (const stop of TOUR) if (stop.cut) expect(cladById.get(stop.cut.id)!.floors[stop.cut.floor]).toBeDefined();
  });
});
