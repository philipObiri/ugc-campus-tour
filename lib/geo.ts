import * as THREE from "three";
import { geoContains, geoEquirectangular, geoGraticule10, geoPath, type GeoProjection } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Topology } from "topojson-specification";
import countries50 from "world-atlas/countries-50m.json";
import countries10 from "world-atlas/countries-10m.json";
import { ACCRA_PLACES, ACCRA_ROADS, AFRICA, GREATER_ACCRA, UGC } from "./data";

export const EARTH_KM = 6371;
const DEG = Math.PI / 180;

/** Matches three's SphereGeometry UV layout, so equirectangular canvases line up exactly. */
export function latLngToVec3(lat: number, lng: number, r = 1) {
  const phi = (90 - lat) * DEG;
  const theta = (lng + 180) * DEG;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

export function vec3ToLatLng(v: THREE.Vector3) {
  const n = v.clone().normalize();
  const lat = 90 - Math.acos(n.y) / DEG;
  let lng = Math.atan2(n.z, -n.x) / DEG - 180;
  if (lng < -180) lng += 360;
  return { lat, lng };
}

type Countries = FeatureCollection<Geometry, { name: string }>;
let _c50: Countries | null = null;
let _ghana10: Feature<Geometry, { name: string }> | null = null;

export function countries() {
  if (!_c50) {
    const topo = countries50 as unknown as Topology;
    _c50 = feature(topo, topo.objects.countries) as unknown as Countries;
  }
  return _c50;
}

function ghanaFine() {
  if (!_ghana10) {
    const topo = countries10 as unknown as Topology;
    const fc = feature(topo, topo.objects.countries) as unknown as Countries;
    _ghana10 = fc.features.find((f) => f.properties.name === "Ghana")!;
  }
  return _ghana10;
}

export function countryAt(lat: number, lng: number) {
  return countries().features.find((f) => geoContains(f, [lng, lat]))?.properties.name ?? null;
}

/** Linear lng/lat → pixel projection for a bounded patch. */
function patchProjection(b: { lonMin: number; lonMax: number; latMin: number; latMax: number }, w: number, h: number) {
  const sx = w / ((b.lonMax - b.lonMin) * DEG);
  const sy = h / ((b.latMax - b.latMin) * DEG);
  // Equirectangular scales x and y equally, so stretch y via a post-transform.
  const p = geoEquirectangular()
    .scale(sx)
    .translate([-b.lonMin * DEG * sx, b.latMax * DEG * sx]);
  const stretch = sy / sx;
  const project = (lng: number, lat: number): [number, number] => {
    const [x, y] = p([lng, lat])!;
    return [x, y * stretch];
  };
  return { p, stretch, project };
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function toTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

export function makeEarthTexture(w = 4096) {
  const h = w / 2;
  const [c, ctx] = canvas(w, h);
  const proj: GeoProjection = geoEquirectangular().scale(w / (2 * Math.PI)).translate([w / 2, h / 2]);
  const path = geoPath(proj, ctx);

  const sea = ctx.createLinearGradient(0, 0, 0, h);
  sea.addColorStop(0, "#050b18");
  sea.addColorStop(0.5, "#0a1a33");
  sea.addColorStop(1, "#050b18");
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(120,160,220,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  path(geoGraticule10());
  ctx.stroke();

  for (const f of countries().features) {
    const name = f.properties.name;
    const africa = AFRICA.has(name);
    ctx.beginPath();
    path(f);
    ctx.fillStyle = name === "Ghana" ? "#d1aa66" : africa ? "#6b4a1c" : "#1c2a40";
    ctx.fill();
    ctx.strokeStyle = africa ? "rgba(255,210,120,0.55)" : "rgba(140,170,210,0.25)";
    ctx.lineWidth = africa ? 1.4 : 0.8;
    ctx.stroke();
  }
  return toTexture(c);
}

/** Night-lights style emissive map: only Africa glows, Ghana brightest. */
export function makeGlowTexture(w = 2048) {
  const h = w / 2;
  const [c, ctx] = canvas(w, h);
  const proj = geoEquirectangular().scale(w / (2 * Math.PI)).translate([w / 2, h / 2]);
  const path = geoPath(proj, ctx);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  for (const f of countries().features) {
    const name = f.properties.name;
    if (!AFRICA.has(name)) continue;
    ctx.beginPath();
    path(f);
    ctx.strokeStyle = name === "Ghana" ? "#ffcf5a" : "#7a5214";
    ctx.lineWidth = name === "Ghana" ? 3 : 1.2;
    ctx.stroke();
    if (name === "Ghana") {
      ctx.fillStyle = "#c78a12";
      ctx.fill();
    }
  }
  return toTexture(c);
}

export function makeGhanaTexture(b: { lonMin: number; lonMax: number; latMin: number; latMax: number }) {
  const w = 1536;
  const h = Math.round((w * (b.latMax - b.latMin)) / (b.lonMax - b.lonMin));
  const [c, ctx] = canvas(w, h);
  const { p, stretch, project } = patchProjection(b, w, h);
  ctx.save();
  ctx.scale(1, stretch);
  const path = geoPath(p, ctx);
  ctx.beginPath();
  path(ghanaFine());
  ctx.fillStyle = "#d1aa66";
  ctx.fill();
  ctx.lineWidth = 3 / stretch;
  ctx.strokeStyle = "#fff1c4";
  ctx.stroke();
  ctx.restore();

  // Greater Accra highlight
  ctx.beginPath();
  GREATER_ACCRA.forEach(([lng, lat], i) => {
    const [x, y] = project(lng, lat);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = "#b8904f";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.stroke();

  const cities: [string, number, number][] = [
    ["Kumasi", -1.62, 6.69], ["Tamale", -0.84, 9.4], ["Takoradi", -1.76, 4.9], ["Cape Coast", -1.25, 5.1],
    ["Ho", 0.47, 6.6], ["Sunyani", -2.33, 7.34], ["Bolgatanga", -0.85, 10.79], ["Lake Volta", -0.2, 7.6],
  ];
  ctx.font = "600 30px system-ui, sans-serif";
  for (const [n, lng, lat] of cities) {
    const [x, y] = project(lng, lat);
    ctx.fillStyle = n === "Lake Volta" ? "rgba(20,40,80,0.8)" : "#2a1600";
    if (n !== "Lake Volta") {
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillText(n, x + 12, y + 10);
  }
  return toTexture(c);
}

export function makeAccraTexture(b: { lonMin: number; lonMax: number; latMin: number; latMax: number }) {
  const w = 3072;
  const h = Math.round((w * (b.latMax - b.latMin)) / (b.lonMax - b.lonMin));
  const [c, ctx] = canvas(w, h);
  const { p, stretch, project } = patchProjection(b, w, h);

  ctx.fillStyle = "#0b2546";
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.scale(1, stretch);
  ctx.beginPath();
  geoPath(p, ctx)(ghanaFine());
  ctx.fillStyle = "#2b2418";
  ctx.fill();
  ctx.restore();

  // Everything below stays on land: clip to Ghana's coastline so nothing spills into the Gulf of Guinea.
  ctx.save();
  ctx.scale(1, stretch);
  ctx.beginPath();
  geoPath(p, ctx)(ghanaFine());
  ctx.restore();
  ctx.save();
  ctx.clip();

  // Greater Accra region
  ctx.beginPath();
  GREATER_ACCRA.forEach(([lng, lat], i) => {
    const [x, y] = project(lng, lat);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(245,184,46,0.16)";
  ctx.fill();
  ctx.setLineDash([22, 14]);
  ctx.strokeStyle = "rgba(255,200,90,0.9)";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.setLineDash([]);

  // Urban texture: scattered blocks
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9000; i++) {
    // denser towards central Accra, thinning out radially (no hard rectangular edge)
    const ang = rnd() * Math.PI * 2;
    const rad = Math.pow(rnd(), 0.75) * 0.3;
    const lng = -0.14 + Math.cos(ang) * rad;
    const lat = 5.63 + Math.sin(ang) * rad * 0.75;
    const [x, y] = project(lng, lat);
    if (rnd() < rad * 2.6) continue;
    ctx.fillStyle = `rgba(255,${180 + rnd() * 60},${90 + rnd() * 60},${0.08 + rnd() * 0.18})`;
    ctx.fillRect(x, y, 4 + rnd() * 8, 4 + rnd() * 8);
  }

  for (const r of ACCRA_ROADS) {
    ctx.beginPath();
    r.pts.forEach(([lng, lat], i) => {
      const [x, y] = project(lng, lat);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = r.name === "Spintex Road" ? "#ffd166" : r.kind === "major" ? "#d7c3a0" : "rgba(215,195,160,0.6)";
    ctx.lineWidth = r.name === "Spintex Road" ? 12 : r.kind === "major" ? 8 : 4;
    ctx.stroke();
  }
  ctx.restore(); // end land clip

  ctx.font = "700 40px system-ui, sans-serif";
  for (const pl of ACCRA_PLACES) {
    const [x, y] = project(pl.lng, pl.lat);
    const sea = pl.name === "Gulf of Guinea";
    ctx.fillStyle = sea ? "rgba(140,190,255,0.7)" : "rgba(255,240,215,0.92)";
    if (!sea) {
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = sea ? "italic 600 54px Georgia, serif" : "700 40px system-ui, sans-serif";
    ctx.fillText(pl.name, x + 16, y + 12);
  }
  const [sx, sy] = project(-0.15, 5.645);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-0.25);
  ctx.fillStyle = "#ffd166";
  ctx.font = "800 34px system-ui, sans-serif";
  ctx.fillText("SPINTEX ROAD", 0, 0);
  ctx.restore();
  const [ux, uy] = project(UGC.lng, UGC.lat);
  ctx.fillStyle = "#d1aa66";
  ctx.beginPath();
  ctx.arc(ux, uy, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 5;
  ctx.stroke();
  return toTexture(c);
}

/** Street-level patch around the campus (~9 km across). */
export function makeSiteTexture(b: { lonMin: number; lonMax: number; latMin: number; latMax: number }) {
  const w = 4096;
  const h = Math.round((w * (b.latMax - b.latMin)) / (b.lonMax - b.lonMin));
  const [c, ctx] = canvas(w, h);
  const { project } = patchProjection(b, w, h);
  const pxPerM = w / ((b.lonMax - b.lonMin) * 111_320);
  ctx.fillStyle = "#3c3426";
  ctx.fillRect(0, 0, w, h);

  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // neighbourhood plots (10–25 m)
  for (let i = 0; i < 26000; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const s = (10 + rnd() * 15) * pxPerM;
    const roofs = ["#8f3b26", "#a9502f", "#6d6a64", "#9c968a", "#b9b2a4", "#7b3122"];
    ctx.fillStyle = roofs[Math.floor(rnd() * roofs.length)];
    ctx.fillRect(x, y, s, s * (0.6 + rnd() * 0.8));
  }
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(${40 + rnd() * 30},${90 + rnd() * 50},${40 + rnd() * 20},0.9)`;
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, (3 + rnd() * 6) * pxPerM, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const r of ACCRA_ROADS) {
    const spintex = r.name === "Spintex Road";
    ctx.beginPath();
    r.pts.forEach(([lng, lat], i) => {
      const [x, y] = project(lng, lat);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#2b2b2e";
    ctx.lineWidth = (spintex ? 22 : r.kind === "major" ? 30 : 12) * pxPerM;
    ctx.stroke();
    ctx.strokeStyle = spintex ? "#f2d16b" : "rgba(255,255,255,0.6)";
    ctx.setLineDash([12 * pxPerM, 10 * pxPerM]);
    ctx.lineWidth = Math.max(1.5, 0.6 * pxPerM);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Campus compound (~160 m × 140 m)
  const [ux, uy] = project(UGC.lng, UGC.lat);
  const cw = 160 * pxPerM;
  const ch = 140 * pxPerM;
  ctx.fillStyle = "rgba(255,180,60,0.25)";
  ctx.fillRect(ux - cw / 2, uy - ch, cw, ch);
  ctx.strokeStyle = "#ffcf5a";
  ctx.lineWidth = 2.5 * pxPerM;
  ctx.strokeRect(ux - cw / 2, uy - ch, cw, ch);
  ctx.fillStyle = "#ffe7a8";
  ctx.font = `800 ${Math.round(14 * pxPerM)}px system-ui, sans-serif`;
  ctx.fillText("SPINTEX RD", ux + 200 * pxPerM, uy + 60 * pxPerM);
  return toTexture(c);
}
