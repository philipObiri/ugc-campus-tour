// Converts the OpenStreetMap extract (data/osm-ugc-lane.json, © OpenStreetMap contributors, ODbL)
// into local metre coordinates for the 3D lane, plus an SVG preview for checking against Google Maps.
// Run: node scripts/build-lane.mjs
import { readFileSync, writeFileSync } from "node:fs";

const osm = JSON.parse(readFileSync(new URL("../data/osm-ugc-lane.json", import.meta.url)));

// Origin = Google Maps pin for University of Gold Coast / Accra Business School.
const LAT0 = 5.6341;
const LON0 = -0.09207;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const KZ = 110574;
const R = 260; // keep features within this many metres of the origin
const toXZ = (lat, lon) => [+((lon - LON0) * KX).toFixed(2), +(-(lat - LAT0) * KZ).toFixed(2)];

// Names read off Google Maps (Oct 2026) and placed with the map's scale bar.
const GOOGLE_POIS = [
  { name: "University of Gold Coast · Accra Business School", lat: 5.63414, lon: -0.09207, kind: "ugc" },
  { name: "ISAG Centre", lat: 5.634408, lon: -0.092418, kind: "office" },
  { name: "Generation4 Consult", lat: 5.634507, lon: -0.09261, kind: "office" },
  { name: "Angels Keepers Montessori", lat: 5.634397, lon: -0.092606, kind: "school" },
  { name: "Akeen Hub", lat: 5.634112, lon: -0.092972, kind: "office" },
  { name: "The Harrison's", lat: 5.633941, lon: -0.092408, kind: "hotel" },
  { name: "Temple Christian International School", lat: 5.634696, lon: -0.091625, kind: "school" },
  { name: "Nirvana Beauty Spa", lat: 5.634644, lon: -0.091136, kind: "shop" },
  { name: "Lifeaid Pharmacy · Baatsona Branch", lat: 5.635079, lon: -0.09117, kind: "pharmacy" },
  { name: "Ravinia Guesthouse", lat: 5.635199, lon: -0.092079, kind: "hotel" },
  { name: "Amadyak Surprise Hub", lat: 5.633687, lon: -0.091843, kind: "shop" },
  { name: "Agyengo Locks", lat: 5.633522, lon: -0.091262, kind: "shop" },
  { name: "Sikakope", lat: 5.633345, lon: -0.091963, kind: "shop" },
  { name: "Uncle Sam BesPoke", lat: 5.633498, lon: -0.092623, kind: "shop" },
  { name: "Nizzop ICT Training Center", lat: 5.633391, lon: -0.090862, kind: "school" },
];

const WIDTH = { secondary: 14, tertiary: 10, unclassified: 8, residential: 6, service: 4, path: 1.5, footway: 1.5 };

const buildings = [];
const roads = [];
const pois = [];

for (const e of osm.elements) {
  const t = e.tags ?? {};
  if (e.type === "node" && t.name) {
    const [x, z] = toXZ(e.lat, e.lon);
    if (Math.hypot(x, z) < R) pois.push({ name: t.name, x, z, kind: t.amenity ?? t.shop ?? t.place ?? "place", src: "osm" });
    continue;
  }
  if (e.type !== "way" || !e.geometry) continue;
  const pts = e.geometry.map((p) => toXZ(p.lat, p.lon));
  if (t.building) {
    if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
    const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
    if (Math.hypot(...c) > R) continue;
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      area += p[0] * q[1] - q[0] * p[1];
    }
    buildings.push({
      id: e.id,
      name: t.name ?? null,
      levels: t["building:levels"] ? Number(t["building:levels"]) : null,
      kind: t.building,
      area: Math.round(Math.abs(area) / 2),
      c: c.map((v) => +v.toFixed(1)),
      pts,
    });
  } else if (t.highway) {
    if (!pts.some(([x, z]) => Math.hypot(x, z) < R + 60)) continue;
    roads.push({
      id: e.id,
      name: t.name ?? null,
      kind: t.highway,
      width: WIDTH[t.highway] ?? 5,
      surface: t.surface ?? (["secondary", "tertiary"].includes(t.highway) ? "asphalt" : "laterite"),
      pts,
    });
  }
}

// Milton Street is named on Google Maps but not in OSM: the east–west lane just south of the campus.
for (const r of roads) {
  if (r.name || r.kind !== "residential") continue;
  const zs = r.pts.map((p) => p[1]);
  const xs = r.pts.map((p) => p[0]);
  const meanZ = zs.reduce((a, b) => a + b, 0) / zs.length;
  if (meanZ > -5 && meanZ < 25 && Math.min(...xs) < -20 && Math.max(...xs) > -60) r.name = "Milton Street";
}

for (const p of GOOGLE_POIS) {
  const [x, z] = toXZ(p.lat, p.lon);
  pois.push({ name: p.name, x, z, kind: p.kind, src: "google" });
}

// Attach each Google name to the building whose outline contains it (or the nearest one).
const inside = (pt, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > pt[1] !== zj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
for (const p of pois) {
  if (p.kind === "place" || p.kind === "ugc") continue;
  let best = buildings.find((b) => inside([p.x, p.z], b.pts));
  if (!best) {
    best = buildings.reduce((a, b) => (Math.hypot(b.c[0] - p.x, b.c[1] - p.z) < Math.hypot(a.c[0] - p.x, a.c[1] - p.z) ? b : a));
    if (Math.hypot(best.c[0] - p.x, best.c[1] - p.z) > 25) continue;
  }
  if (!best.name) best.name = p.name;
}

writeFileSync(new URL("../lib/lane.json", import.meta.url), JSON.stringify({ origin: { lat: LAT0, lon: LON0 }, buildings, roads, pois }));

// ---- SVG preview ----
const S = 2;
const W = R * 2 * S;
const tx = (x) => ((x + R) * S).toFixed(1);
const tz = (z) => ((z + R) * S).toFixed(1);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${W}" height="${W}"><rect width="100%" height="100%" fill="#f3f1ec"/>`;
for (const r of roads)
  svg += `<polyline points="${r.pts.map(([x, z]) => tx(x) + "," + tz(z)).join(" ")}" fill="none" stroke="${r.surface === "asphalt" ? "#9aa" : "#d9a77a"}" stroke-width="${r.width * S}" stroke-linecap="round" stroke-linejoin="round"/>`;
for (const b of buildings)
  svg += `<polygon points="${b.pts.map(([x, z]) => tx(x) + "," + tz(z)).join(" ")}" fill="${b.id === 948095838 ? "#e8b84a" : b.name ? "#9cc" : "#ccc"}" stroke="#777" stroke-width="1"/>`;
for (const p of pois)
  svg += `<circle cx="${tx(p.x)}" cy="${tz(p.z)}" r="5" fill="${p.src === "google" ? "#d33" : "#33d"}"/><text x="${+tx(p.x) + 7}" y="${+tz(p.z) + 4}" font-size="13" font-family="sans-serif">${p.name.replace(/&/g, "&amp;").replace(/'/g, "&#39;")}</text>`;
for (const r of roads)
  if (r.name) {
    const m = r.pts[Math.floor(r.pts.length / 2)];
    svg += `<text x="${tx(m[0])}" y="${tz(m[1])}" font-size="15" font-weight="bold" fill="#835">${r.name}</text>`;
  }
svg += `</svg>`;
writeFileSync(new URL("../data/lane-preview.svg", import.meta.url), svg);

console.log(`buildings ${buildings.length}, roads ${roads.length}, pois ${pois.length}`);
console.log("named buildings:", buildings.filter((b) => b.name).map((b) => `${b.name} (${b.area}m², c=${b.c})`).join("\n  "));
console.log("named roads:", [...new Set(roads.filter((r) => r.name).map((r) => r.name))].join(", "));
