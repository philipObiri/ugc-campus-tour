// Walking-tour guide: stops visited in order, with narration. Positions are local metres.
import { CAFETERIA, GATE, HALL_ID, MAIN_ID, STUDENT_SERVICES, TEMPLE_PATH, cladById } from "./campus";
import type { XZ } from "./laneGeometry";

export type GuideStop = {
  id: string;
  title: string;
  line: string;
  /** Where the beacon stands; reached when within `radius` metres (or when entering `building`). */
  pos: XZ;
  radius: number;
  building?: number;
};

const centre = (pts: XZ[]): XZ => [pts.reduce((t, p) => t + p[0], 0) / pts.length, pts.reduce((t, p) => t + p[1], 0) / pts.length];
const outside = (pts: XZ[], door: [XZ, XZ], d = 2.5): XZ => {
  const [a, b] = door;
  const c = centre(pts);
  const mx = (a[0] + b[0]) / 2;
  const mz = (a[1] + b[1]) / 2;
  const len = Math.hypot(mx - c[0], mz - c[1]) || 1;
  return [mx + ((mx - c[0]) / len) * d, mz + ((mz - c[1]) / len) * d];
};

/** Entrance positions are filled in at runtime from the building outlines (see Guide.tsx). */
export function guideStops(entrance: (id: number) => XZ): GuideStop[] {
  return [
    {
      id: "gate",
      title: "Main Gate",
      line: "Akwaaba! I'm your UGC guide. You're walking in through the black sliding gate of the University of Gold Coast, home of Accra Business School.",
      pos: [(GATE.a[0] + GATE.b[0]) / 2, GATE.a[1] - 1.5],
      radius: 4,
    },
    {
      id: "ssc",
      title: "Student Services Centre",
      line: "On your left is the red-and-white Student Services Centre, the first stop for enquiries and student support.",
      pos: outside(STUDENT_SERVICES.pts, STUDENT_SERVICES.door),
      radius: 5,
    },
    {
      id: "main",
      title: "UGC Main Campus",
      line: "Ahead is the Main Campus, wrapped in white circle-cut metal panels. Offices are on the ground floor, the canteen and ICT lab on the first, lecture and guest rooms on floors two to four, and the boardroom and faculty offices on the fifth. Walk in through the glass entrance.",
      pos: entrance(MAIN_ID),
      radius: 4,
      building: MAIN_ID,
    },
    {
      id: "hall",
      title: "Gold Coast Hall",
      line: "Across the lane stands the Gold Coast Hall, UGC's conference hall. Its auditorium, lit by a chandelier, hosted the 2025 graduation of more than 650 students. Step inside through the entrance facing the Main Campus.",
      pos: entrance(HALL_ID),
      radius: 4,
      building: HALL_ID,
    },
    {
      id: "cafe",
      title: "Cafeteria",
      line: "Right beside the Hall is the cafeteria. From here, the footpath leads across the lane to Temple Christian International School.",
      pos: outside(CAFETERIA.pts, CAFETERIA.door),
      radius: 4.5,
    },
    {
      id: "temple",
      title: "Temple Christian International School",
      line: "This is Temple Christian International School, UGC's next-door neighbour. Turn around to see the Main Campus and the Gold Coast Hall facing each other across the lane. That completes the walking tour. Enjoy exploring!",
      pos: TEMPLE_PATH[TEMPLE_PATH.length - 1],
      radius: 5,
    },
  ];
}

/** Narration when you arrive on a floor inside one of the UGC buildings. */
export function floorLine(id: number, floor: number) {
  const spec = cladById.get(id);
  if (!spec) return null;
  const fl = spec.floors[floor];
  const rooms = fl.rooms.map((r) => r.name).filter((n, i, a) => a.indexOf(n) === i);
  const listed = rooms.length > 4 ? `${rooms.slice(0, 3).join(", ")} and more` : rooms.join(", ");
  const note = fl.rooms.find((r) => r.note)?.note ?? "";
  return { title: `${spec.title} · ${fl.name}`, line: `You're on the ${fl.name.toLowerCase()}: ${listed}. ${note}`.trim() };
}
