// Guided-tour stops on the real lane around UGC. Camera positions are in local metres.
// A stop with `cut` opens that building's floor in cutaway (dollhouse) view.
import { HALL_ID, MAIN_ID } from "./campus";

export type TourStop = {
  id: string;
  kicker: string;
  name: string;
  blurb: string;
  facts: string[];
  target: [number, number, number];
  cam: [number, number, number];
  cut?: { id: number; floor: number };
};

export const TOUR: TourStop[] = [
  {
    id: "arrive",
    kicker: "Stop 1 · Arrival",
    name: "Otu Adzin Road, Baatsona",
    blurb: "Most visitors come up Otu Adzin Road from Spintex Road. UGC sits one block in, next to Temple Christian International School.",
    facts: ["Google address: Basket Junction, near Pleasant Place Church", "Plus code JWM5+J5V", "Lifeaid Pharmacy and Noelie's Pub line the junction"],
    target: [110, 2, -60],
    cam: [175, 38, -10],
  },
  {
    id: "gate",
    kicker: "Stop 2 · Through the gate",
    name: "Main Gate & Student Services Centre",
    blurb: "Walk through the main gate and the red-and-white Student Services Centre is right there in the corner of the entrance.",
    facts: ["Student Services in the corner by the gate", "Interlocking-paver forecourt", "Main Campus entrance just ahead"],
    target: [-8, 1.5, 4],
    cam: [6, 13, 26],
  },
  {
    id: "cafe",
    kicker: "Stop 3 · Grab a bite",
    name: "Cafeteria",
    blurb: "Across the lane, right beside the Gold Coast Hall, is the cafeteria. A footpath from it leads to Temple Christian International School.",
    facts: ["Beside the Gold Coast Hall", "Footpath to Temple Christian International School", "Across the lane from the Main Campus"],
    target: [64, 1.8, 20],
    cam: [74, 13, -2],
  },
  {
    id: "main",
    kicker: "Stop 4 · The heart of campus",
    name: "UGC Main Campus",
    blurb: "Seven storeys wrapped in white circle-cut metal panels, stretching from the forecourt by the gate to Temple Christian International School. The entrance faces the forecourt.",
    facts: ["Ground: offices · 1st: canteen & ICT lab", "2nd–4th: lecture rooms & guest rooms", "5th: boardroom & faculty offices · 6th: top floor"],
    target: [14, 12, -16],
    cam: [-6, 28, 34],
  },
  {
    id: "main-1",
    kicker: "Stop 5 · Inside · 1st floor",
    name: "Canteen & ICT Lab",
    blurb: "The first floor holds the canteen and the ICT lab. Click any room for details, or switch to Walk mode to explore at eye level.",
    facts: ["Canteen with serving counter and tables", "ICT lab with rows of workstations", "Lift and stairs at the end of the corridor"],
    target: [0, 0, 0],
    cam: [0, 0, 0],
    cut: { id: MAIN_ID, floor: 1 },
  },
  {
    id: "main-3",
    kicker: "Stop 6 · Inside · 2nd–4th floors",
    name: "Lecture Rooms & Guest Rooms",
    blurb: "Floors two to four combine lecture rooms on one side of the corridor with guest rooms on the other.",
    facts: ["Lecture rooms with screens and desk rows", "Guest rooms with bed, wardrobe and en-suite", "Same layout on floors 2, 3 and 4"],
    target: [0, 0, 0],
    cam: [0, 0, 0],
    cut: { id: MAIN_ID, floor: 3 },
  },
  {
    id: "main-5",
    kicker: "Stop 7 · Inside · 5th floor",
    name: "Boardroom & Faculty Offices",
    blurb: "The fifth floor is home to the boardroom and faculty offices.",
    facts: ["Boardroom with long table", "Faculty offices", "The top floor (6th) is above"],
    target: [0, 0, 0],
    cam: [0, 0, 0],
    cut: { id: MAIN_ID, floor: 5 },
  },
  {
    id: "hall",
    kicker: "Stop 8 · Across the lane",
    name: "University of Gold Coast Hall",
    blurb: "Directly across the lane from the Main Campus, facing it, stands the Gold Coast Hall: a separate conference hall in the same white circle-cut cladding. UGC's 2025 graduation, with more than 650 graduates, was held here.",
    facts: ["Ground floor foyer", "Large auditorium with chandelier", "Gallery above · staff offices on the top floor"],
    target: [40, 7, 18],
    cam: [-14, 18, 6],
  },
  {
    id: "hall-aud",
    kicker: "Stop 9 · Inside the Hall",
    name: "Auditorium & Chancellor's Holding Room",
    blurb: "The large auditorium for events, lit by a chandelier, with a red patterned backdrop, a wooden stage and maroon seating. The Chancellor's holding room is beside the stage.",
    facts: ["Chandelier over the seating", "Wooden stage with steps", "Chancellor's Holding Room off the stage"],
    target: [0, 0, 0],
    cam: [0, 0, 0],
    cut: { id: HALL_ID, floor: 1 },
  },
  {
    id: "hall-gal",
    kicker: "Stop 10 · Up top",
    name: "The Gallery",
    blurb: "Balcony seating wraps around the auditorium, looking down on the stage and the chandelier.",
    facts: ["Glass railing around the opening", "Overlooks stage and chandelier", "Staff offices on the floor above"],
    target: [0, 0, 0],
    cam: [0, 0, 0],
    cut: { id: HALL_ID, floor: 2 },
  },
  {
    id: "temple",
    kicker: "Stop 11 · Next door",
    name: "Temple Christian International School",
    blurb: "UGC's neighbour to the east, a four-storey school beside the Main Campus.",
    facts: ["4 storeys (OpenStreetMap)", "About 594 m² footprint", "Directly east of the Main Campus"],
    target: [70, 6, -15],
    cam: [100, 26, 30],
  },
  {
    id: "milton",
    kicker: "Stop 12 · Main street",
    name: "Milton Street",
    blurb: "The east–west street that ties the block together, lined with small businesses.",
    facts: ["The Harrison's", "Amadyak Surprise Hub (gift shop)", "Sikakope · Uncle Sam BesPoke", "Agyengo Locks"],
    target: [-20, 2, 14],
    cam: [-80, 22, 50],
  },
  {
    id: "church",
    kicker: "Stop 13 · The landmark in the address",
    name: "Pleasant Place Church",
    blurb: "UGC's Google listing gives directions as \"Basket Junction near Pleasant Place Church\". The church's large hall stands to the south-east, by Otu Adzin Road.",
    facts: ["About 1,470 m² footprint", "Near the Baatsona junction", "Nizzop ICT Training Center is close by"],
    target: [164, 4, 37],
    cam: [120, 40, 100],
  },
  {
    id: "finale",
    kicker: "Finale · From above",
    name: "Born for Commerce. Built for Industry.",
    blurb: "Founded in 2004 as AFRILEAD, the school became Accra Business School and then the University of Gold Coast. It received a Presidential Charter in December 2024 and is accredited by GTEC.",
    facts: ["Presidential Charter · Dec 2024", "Wrexham University MBA partner", "Undergraduate · Postgraduate · Professional"],
    target: [10, 0, -5],
    cam: [-90, 150, 190],
  },
];
