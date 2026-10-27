// The UGC compound, as described by a UGC student and checked against Google Maps satellite imagery:
//   Temple Christian International School · UGC Main Campus beside it · UGC Hall across the lane, facing it.
//   Gate on the street, cafeteria just inside the gate, red-and-white Student Services Centre at the far
//   end of the forecourt in front of the Main Campus. Both main buildings are clad in circle-cut metal.
// Footprints of the two main buildings are OpenStreetMap outlines; room positions are illustrative.

import type { XZ } from "./laneGeometry";

export type RoomKind =
  | "lobby" | "cafeteria" | "kitchen" | "shop" | "wc" | "auditorium" | "gallery" | "seminar" | "guest" | "lounge"
  | "lecture" | "lab" | "library" | "office" | "board" | "admissions" | "terrace";

export type Room = { name: string; kind: RoomKind; band: "a" | "b" | "full"; share: number; note?: string };
export type Floor = { name: string; short: string; rooms: Room[]; voidBelow?: boolean };

/** Which way a building's entrance and sign face. */
export type Face = "south" | "north" | "west" | "east";

/** An entrance; `sign` puts the building's name in bold above it, near the top of the facade. */
export type Entrance = { face: Face; near?: XZ; sign?: boolean };

export type CladSpec = {
  id: number;
  key: "main" | "hall";
  /** Which way the entrance and sign face. */
  face: Face;
  /** Side with the black vertical-bar palisade fence behind the building. */
  rear: Face;
  /** Put the entrance on the front-facing wall section nearest this point (default: the longest one). */
  frontNear?: XZ;
  /** Further entrances (each gets its own doorway and canopy; the sign stays on the main one). */
  extraEntrances?: Entrance[];
  /** "middle": centre the main sign across the whole front facade at mid-height (default: over the entrance). */
  signAt?: "middle" | "entrance";
  title: string;
  sign: "hall" | "main";
  floors: Floor[];
};

export const GROUND_H = 4.2;
export const FLOOR_H = 3.6;
export const floorBase = (i: number) => (i === 0 ? 0 : GROUND_H + (i - 1) * FLOOR_H);
export const floorTop = (i: number) => floorBase(i) + (i === 0 ? GROUND_H : FLOOR_H);

const lectureAndGuest = (lvl: number): Room[] => [
  { name: `Lecture Room ${lvl}01`, kind: "lecture", band: "a", share: 0.5 },
  { name: `Lecture Room ${lvl}02`, kind: "lecture", band: "a", share: 0.5 },
  ...[1, 2, 3, 4].map((i) => ({ name: `Guest Room ${lvl}${i + 10}`, kind: "guest" as const, band: "b" as const, share: 1 })),
];

export const MAIN_ID = 948095838;
// The Hall stands across the lane from the Main Campus, its front facing back toward it (north).
export const HALL_ID = 948095836;

export const CLAD: CladSpec[] = [
  {
    id: MAIN_ID,
    key: "main",
    face: "south",
    rear: "north",
    signAt: "middle", // the UGC logo sits in the middle of the Main Campus facade
    title: "UGC Main Campus",
    sign: "main",
    floors: [
      {
        name: "Ground floor · Offices",
        short: "G",
        rooms: [
          { name: "Reception & Lobby", kind: "lobby", band: "a", share: 0.45 },
          { name: "General Office", kind: "office", band: "a", share: 0.55 },
          { name: "Accounts Office", kind: "office", band: "b", share: 0.5 },
          { name: "Registry", kind: "office", band: "b", share: 0.5 },
        ],
      },
      {
        name: "1st floor · Canteen & ICT Lab",
        short: "1",
        rooms: [
          { name: "Canteen", kind: "cafeteria", band: "a", share: 1, note: "Meals and drinks on the first floor of the Main Campus." },
          { name: "ICT Lab", kind: "lab", band: "b", share: 1, note: "Computer lab for coursework, research and Business Intelligence & Analytics classes." },
        ],
      },
      { name: "2nd floor · Lecture & Guest Rooms", short: "2", rooms: lectureAndGuest(2) },
      { name: "3rd floor · Lecture & Guest Rooms", short: "3", rooms: lectureAndGuest(3) },
      { name: "4th floor · Lecture & Guest Rooms", short: "4", rooms: lectureAndGuest(4) },
      {
        name: "5th floor · Boardroom & Faculty",
        short: "5",
        rooms: [
          { name: "Boardroom", kind: "board", band: "a", share: 1 },
          { name: "Faculty Offices", kind: "office", band: "b", share: 1 },
        ],
      },
      {
        name: "6th floor · Top floor",
        short: "6",
        rooms: [{ name: "Top Floor", kind: "terrace", band: "full", share: 1, note: "The top-most floor of the Main Campus." }],
      },
    ],
  },
  {
    id: HALL_ID,
    key: "hall",
    face: "north", // main entrance on the lane, facing the Main Campus
    rear: "south",
    // second entrance at the north end of the west face, toward the gate (per a UGC student)
    extraEntrances: [{ face: "west", near: [18, 9], sign: true }],
    title: "University of Gold Coast Hall",
    sign: "hall",
    floors: [
      {
        name: "Ground floor · Foyer",
        short: "G",
        rooms: [
          { name: "Hall Foyer & Reception", kind: "lobby", band: "a", share: 1 },
          { name: "Cloakroom & Restrooms", kind: "wc", band: "b", share: 1 },
        ],
      },
      {
        name: "Auditorium",
        short: "A",
        rooms: [
          { name: "Chancellor's Holding Room", kind: "lounge", band: "full", share: 0.22, note: "A private holding room for the Chancellor beside the auditorium stage." },
          { name: "Main Auditorium", kind: "auditorium", band: "full", share: 0.78, note: "A large event auditorium lit by a grand chandelier, used for conferences, congregations and events." },
        ],
      },
      {
        name: "Gallery",
        short: "Gal",
        voidBelow: true,
        rooms: [{ name: "Gallery", kind: "gallery", band: "full", share: 1, note: "Balcony seating overlooking the auditorium and its chandelier." }],
      },
      {
        name: "Top floor · Staff Offices",
        short: "Off",
        rooms: [
          { name: "Staff Offices", kind: "office", band: "a", share: 1 },
          { name: "Staff Offices (East)", kind: "office", band: "b", share: 1 },
        ],
      },
    ],
  },
];

export const cladById = new Map(CLAD.map((c) => [c.id, c]));

/** All entrances of a clad building, the main (signed) one first. */
export const entrancesOf = (spec: CladSpec | undefined): Entrance[] =>
  spec ? [{ face: spec.face, near: spec.frontNear }, ...(spec.extraEntrances ?? [])] : [];

// ---------- forecourt structures (positions in local metres; x = east, z = south) ----------
export type SmallBuilding = { id: string; name: string; pts: XZ[]; height: number; wall: string; trim: string; roof: string; door: [XZ, XZ]; note: string };

// Placement confirmed by a UGC student: the red-and-white Student Services Centre sits in the
// corner of the entrance by the gate; the cafeteria stands beside the Gold Coast Hall, with a
// footpath from it to Temple Christian International School. Both are short single-storey blocks.
export const STUDENT_SERVICES: SmallBuilding = {
  id: "ssc",
  name: "Student Services Centre",
  pts: [[-14, 2], [-7.5, 2], [-7.5, 8.5], [-14, 8.5]],
  height: 3.6,
  wall: "#f6f4f0",
  trim: "#c0392b",
  roof: "#c0392b",
  door: [[-7.5, 4.2], [-7.5, 6.2]],
  note: "Red and white, in the corner of the entrance right by the main gate: the first stop for student enquiries.",
};

export const CAFETERIA: SmallBuilding = {
  id: "cafeteria",
  name: "Cafeteria",
  // right beside the Gold Coast Hall, against its east wall
  pts: [[61.5, 15.5], [66.5, 15.5], [66.5, 26], [61.5, 26]],
  height: 3.6,
  wall: "#f2e6cf",
  trim: "#b5653d",
  roof: "#8e3426",
  door: [[62.5, 15.5], [64.5, 15.5]],
  note: "Beside the Gold Coast Hall. A footpath from here crosses the lane to Temple Christian International School.",
};

// The black slatted sliding gate spans the whole street frontage; its opening is at the far (east) end,
// where the lane continues toward the Gold Coast Hall and the cafeteria.
export const GATE = { a: [0, 10] as XZ, b: [5, 10] as XZ };
/** Street frontage (slatted gate) and the side wall. */
export const COMPOUND_WALLS: [XZ, XZ][] = [
  [[-17, 10], GATE.a],
  [[-17, 10], [-17, -6]],
];
/** Footpath from the cafeteria, across the lane, to Temple Christian International School. */
export const TEMPLE_PATH: XZ[] = [[64, 14.6], [64.5, 8], [64, 2], [63, -5.5]];

export const WALK_SPAWN = { x: 2.5, z: 15.5, yaw: Math.PI };
