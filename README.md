# UGC Virtual Campus Tour

An interactive 3D tour of the **University of Gold Coast** (Accra Business School), Baatsona, off Milton Street, Spintex, Accra.

- **Intro** with an academic gold-and-black backdrop and the official UGC logo.
- **Globe**: drag and scroll from space to Africa, Ghana, Greater Accra and down to UGC. Gold arcs link UGC to its global community.
- **Campus**: the real block around UGC built from OpenStreetMap outlines, including the Main Campus and the Gold Coast Hall in their circle-cut metal cladding, the cafeteria, the Student Services Centre, and the slatted sliding gate.
- **Walk mode**: move the mouse to look, scroll or use the arrow keys to walk, click the ground to go there, and take the lift between floors. On phones and tablets, swipe to look, pinch to step, or use the on-screen joystick. A live tour guide narrates each place, with optional voice.
- **Floor cutaways**: see each floor from above, including lecture rooms, guest rooms, the canteen, the ICT lab, and the auditorium with its chandelier.

Room layouts inside the buildings are illustrative.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Tests

```bash
npm test
```

The tests check the collision maths, the campus layout (entrances, building placement), that walking routes go through doorways and not through walls, and a 60-second physics run in which cars, people and walls never overlap.

## Deploy

Import this repository in [Vercel](https://vercel.com/new). It is a standard Next.js app with no environment variables or extra settings.

## Data & credits

- Buildings and streets © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL), converted with `node scripts/build-lane.mjs` from `data/osm-ugc-lane.json`.
- Country outlines from [Natural Earth](https://www.naturalearthdata.com/) via `world-atlas`.
- Place names from Google Maps. UGC logo from ugc.edu.gh.
