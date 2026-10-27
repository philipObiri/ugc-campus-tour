// Traffic and pedestrian simulation (no React): Intelligent Driver Model for cars, shoulder walking
// and safe crossing for people, plus hard no-overlap constraints between cars, people, walls and the visitor.
import * as THREE from "three";
import {
  HALL_ACCESS_ROAD_ID, SIDE_LANE_ID, distToSeg, lane, pathLengths, pointInPoly, seeded, type LaneRoad, type XZ,
} from "./laneGeometry";
import { boxesOverlap, outsideSegments, pushOutOfBox, resolveCircle, type Box } from "./collision";
import { VEHICLE_DIMS, type VehicleKind } from "@/components/lane/models";

/** The first-person visitor (walk mode), so traffic yields to them like any pedestrian. */
export const WALKER = { active: false, pos: new THREE.Vector3() };

// =====================================================================
// Shared spatial helpers
// =====================================================================
const BUILDING_BOXES = lane.buildings.map((b) => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of b.pts) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  return { x0, x1, z0, z1, pts: b.pts };
});

function insideBuilding(x: number, z: number, pad = 0) {
  for (const b of BUILDING_BOXES) {
    if (x < b.x0 - pad || x > b.x1 + pad || z < b.z0 - pad || z > b.z1 + pad) continue;
    if (pointInPoly(x, z, b.pts)) return true;
    if (pad > 0) {
      for (let i = 0; i < b.pts.length; i++) if (distToSeg(x, z, b.pts[i], b.pts[(i + 1) % b.pts.length]) < pad) return true;
    }
  }
  return false;
}

function nearRoad(x: number, z: number, extra: number) {
  for (const r of lane.roads) {
    for (let i = 0; i < r.pts.length - 1; i++) if (distToSeg(x, z, r.pts[i], r.pts[i + 1]) < r.width / 2 + extra) return true;
  }
  return false;
}

type Route = { road: LaneRoad; pts: XZ[]; lengths: number[]; total: number; v0: number; lane: number };

function makeRoute(pts: XZ[], road: LaneRoad, v0: number): Route {
  const { lengths, total } = pathLengths(pts);
  return { road, pts, lengths, total, v0, lane: Math.max(1.35, road.width / 4) };
}

/** Sample position, unit direction and left normal at arc length s. */
function sample(route: Route, s: number) {
  s = Math.max(0, Math.min(route.total, s));
  let i = 0;
  while (i < route.lengths.length - 1 && s > route.lengths[i]) {
    s -= route.lengths[i];
    i++;
  }
  const a = route.pts[i];
  const b = route.pts[i + 1];
  const len = route.lengths[i] || 1;
  const f = Math.min(1, s / len);
  const dx = (b[0] - a[0]) / len;
  const dz = (b[1] - a[1]) / len;
  return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, dx, dz, nx: -dz, nz: dx };
}

const roadById = (id: number) => lane.roads.find((r) => r.id === id)!;
const roadsByName = (n: string) => lane.roads.filter((r) => r.name === n);

function chain(...parts: XZ[][]) {
  const out: XZ[] = [];
  for (const p of parts) for (const q of p) if (!out.length || Math.hypot(out.at(-1)![0] - q[0], out.at(-1)![1] - q[1]) > 0.5) out.push(q);
  return out;
}

// =====================================================================
// Agents
// =====================================================================
export type Vehicle = {
  id: number; kind: VehicleKind; route: Route | null; s: number; dir: 1 | -1; v: number; v0: number; lat: number;
  pos: THREE.Vector3; yaw: number; accel: number; wheel: number; flash: number; parked: boolean; len: number; halfW: number;
  paint: string; group?: THREE.Group | null; wheels: THREE.Object3D[];
  prev?: { s: number; lat: number; yaw: number; x: number; z: number; dir: number }; body?: THREE.Group | null; brakeMat?: THREE.MeshStandardMaterial; headMat?: THREE.MeshStandardMaterial;
};

export type PedState = "walk" | "look" | "cross" | "idle" | "wave";
export type Ped = {
  id: number; route: Route | null; s: number; dir: 1 | -1; side: 1 | -1; lat: number; latBias: number; speed: number;
  state: PedState; timer: number; pos: THREE.Vector3; yaw: number; phase: number; v: number; nextCross: number;
  faceYaw?: number;
  /** Last position known to be valid (outside buildings and vehicles). */
  prev?: { x: number; z: number; s: number; lat: number; side: 1 | -1; valid: boolean }; look: Partial<Record<"legL" | "legR" | "armL" | "armR" | "foreL" | "foreR" | "root", THREE.Object3D | null>>;
  look2: { skin: string; top: string; bottom: string; hair: string; dress: boolean; wrap: string | null; kente: boolean; scale: number };
};

const SKIN = ["#5a3a28", "#4a2f20", "#6b4430", "#3d261a", "#7a4e36"];
const TOPS = ["#ffffff", "#ffffff", "#f5f5f0", "#9cc3e6", "#1f3a68", "#c0392b", "#f1c40f", "#16a085", "#e67e22", "#2c3e50"];
const BOTTOMS = ["#1c1c22", "#2d3436", "#3b3b55", "#6d5d4b", "#1f2a44"];
const WRAPS = ["#e74c3c", "#f1c40f", "#8e44ad", "#16a085", "#e67e22"];

export const LINES = [
  "Akwaaba! Welcome to UGC 👋",
  "Heading to the Hall for my MBA class",
  "The perforated facade looks amazing at night!",
  "Library resources? All online. EBSCO, JSTOR…",
  "Trotro to Spintex is that way 👉",
  "Congregation photos in front of the Hall!",
  "Lunch at Milton Street, then lectures",
];

// =====================================================================
// Simulation setup
// =====================================================================
export function buildSim() {
  const r = seeded(31);
  const otu = roadsByName("Otu Adzin Road").sort((a, b) => b.pts.length - a.pts.length)[0];
  const milton = roadsByName("Milton Street")[0];
  const access = roadById(HALL_ACCESS_ROAD_ID);
  const side = roadById(SIDE_LANE_ID);

  const routes: Route[] = [];
  if (otu) routes.push(makeRoute(otu.pts, otu, 11));
  if (milton && access) routes.push(makeRoute(chain([...milton.pts].reverse(), access.pts), milton, 7));
  if (side) routes.push(makeRoute(side.pts, side, 5.5));
  const fourteenth = roadsByName("14th Street")[0];
  if (fourteenth) routes.push(makeRoute(fourteenth.pts, fourteenth, 9));

  const vehicles: Vehicle[] = [];
  let vid = 0;
  const paints = ["#c9ccd1", "#f2f2ef", "#1b1e24", "#8b1e1e", "#2c4f7c", "#6b6f75", "#d8d2c4"];
  const newVehicle = (kind: VehicleKind, route: Route | null, s: number, dir: 1 | -1, parked = false): Vehicle => {
    const d = VEHICLE_DIMS[kind];
    return {
      id: vid++, kind, route, s, dir, v: parked ? 0 : 3 + r() * 3, v0: route ? route.v0 * (0.85 + r() * 0.3) : 0, lat: 0,
      pos: new THREE.Vector3(), yaw: 0, accel: 0, wheel: 0, flash: 0, parked, len: d.length, halfW: d.width / 2,
      paint: kind === "trotro" ? (r() > 0.5 ? "#f4f1e6" : "#e9e2c9") : paints[Math.floor(r() * paints.length)], wheels: [],
    };
  };

  // moving traffic, spaced out along each route
  routes.forEach((route, ri) => {
    const n = ri === 0 ? 7 : ri === 1 ? 4 : 3;
    for (let k = 0; k < n; k++) {
      const kind: VehicleKind = ri === 0 && k % 3 === 1 ? "trotro" : r() < 0.45 ? "taxi" : "sedan";
      const dir: 1 | -1 = k % 2 ? 1 : -1;
      const veh = newVehicle(kind, route, (route.total * (k + 0.5)) / n, dir);
      const sm = sample(route, veh.s);
      veh.lat = dir * route.lane;
      veh.yaw = Math.atan2(sm.dx * dir, sm.dz * dir);
      veh.pos.set(sm.x + sm.nx * veh.lat, 0, sm.z + sm.nz * veh.lat);
      vehicles.push(veh);
    }
  });
  // make sure there is always a trotro near the campus to ride
  if (!vehicles.some((v) => v.kind === "trotro") && routes[1]) vehicles.push(newVehicle("trotro", routes[1], 20, 1));

  // parked cars on the shoulders of the hall's lane and the side lane
  for (const road of [access, side]) {
    if (!road) continue;
    const route = makeRoute(road.pts, road, 0);
    for (let s = 6; s < Math.min(route.total, 70); s += 6.2) {
      if (r() < 0.3) continue;
      const sideSign = r() > 0.5 ? 1 : -1;
      const sm = sample(route, s);
      const lat = sideSign * (road.width / 2 + 0.6);
      const x = sm.x + sm.nx * lat;
      const z = sm.z + sm.nz * lat;
      if (insideBuilding(x, z, 1.2)) continue;
      const veh = newVehicle(r() < 0.3 ? "taxi" : "sedan", null, 0, 1, true);
      veh.pos.set(x, 0, z);
      veh.yaw = Math.atan2(sm.dx, sm.dz) + (r() > 0.5 ? Math.PI : 0);
      vehicles.push(veh);
    }
  }

  // pedestrians on the shoulders of nearby streets
  const walkRoads = lane.roads.filter((rd) => {
    const near = rd.pts.some(([x, z]) => Math.hypot(x - 20, z) < 120);
    return near && rd.kind !== "path" && pathLengths(rd.pts).total > 25;
  });
  const peds: Ped[] = [];
  let pid = 0;
  const look = () => {
    const dress = r() < 0.35;
    return {
      skin: SKIN[Math.floor(r() * SKIN.length)],
      top: TOPS[Math.floor(r() * TOPS.length)],
      bottom: dress ? WRAPS[Math.floor(r() * WRAPS.length)] : BOTTOMS[Math.floor(r() * BOTTOMS.length)],
      hair: "#141010",
      dress,
      wrap: dress && r() < 0.5 ? WRAPS[Math.floor(r() * WRAPS.length)] : null,
      kente: r() < 0.12,
      scale: 0.92 + r() * 0.16,
    };
  };
  for (let i = 0; i < 38; i++) {
    const road = walkRoads[i % walkRoads.length];
    const route = makeRoute(road.pts, road, 0);
    const sideSign: 1 | -1 = r() > 0.5 ? 1 : -1;
    let s = r() * route.total;
    // find a start point that isn't inside a building
    for (let tries = 0; tries < 10; tries++) {
      const sm = sample(route, s);
      const lat = sideSign * (road.width / 2 + 1.1);
      if (!insideBuilding(sm.x + sm.nx * lat, sm.z + sm.nz * lat, 0.3)) break;
      s = r() * route.total;
    }
    peds.push({
      id: pid++, route, s, dir: r() > 0.5 ? 1 : -1, side: sideSign, lat: sideSign * (road.width / 2 + 1.1), latBias: 0,
      speed: 1.05 + r() * 0.45, state: "walk", timer: 0, pos: new THREE.Vector3(), yaw: 0, phase: r() * 10, v: 0,
      nextCross: 8 + r() * 25, look: {}, look2: look(),
    });
  }
  // event-day crowd gathered in front of the Hall (as in visitor photos)
  if (access) {
    const route = makeRoute(access.pts, access, 0);
    for (let g = 0; g < 3; g++) {
      const sm = sample(route, 12 + g * 12);
      const cx = sm.x + sm.nx * -2;
      const cz = sm.z + sm.nz * -2;
      const n = 5 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const x = cx + Math.cos(a) * 1.1;
        const z = cz + Math.sin(a) * 1.1;
        if (insideBuilding(x, z, 0.3)) continue;
        peds.push({
          id: pid++, route: null, s: 0, dir: 1, side: 1, lat: 0, latBias: 0, speed: 0, state: "idle", timer: r() * 5,
          pos: new THREE.Vector3(x, 0, z), yaw: Math.atan2(cx - x, cz - z), phase: r() * 10, v: 0, nextCross: 1e9,
          look: {}, look2: { ...look(), top: r() < 0.6 ? "#ffffff" : TOPS[Math.floor(r() * TOPS.length)] },
        });
      }
    }
  }

  // trees in open ground: off roads and away from buildings
  const trees: { x: number; z: number; kind: "palm" | "mango" | "neem"; s: number; rot: number }[] = [];
  for (let tries = 0; tries < 4000 && trees.length < 150; tries++) {
    const x = (r() - 0.5) * 460;
    const z = (r() - 0.5) * 460;
    if (insideBuilding(x, z, 2.2) || nearRoad(x, z, 2.6)) continue;
    if (x > -20 && x < 50 && z > -30 && z < 12) continue; // keep the UGC forecourt and building fronts clear
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 6)) continue;
    const k = r();
    trees.push({ x, z, kind: k < 0.4 ? "palm" : k < 0.75 ? "mango" : "neem", s: 0.8 + r() * 0.45, rot: r() * Math.PI * 2 });
  }

  return { vehicles, peds, trees, routes, palmRefs: [] as THREE.InstancedMesh[] };
}

export type Sim = ReturnType<typeof buildSim>;

// =====================================================================
// Vehicle physics: Intelligent Driver Model + yielding to pedestrians
// =====================================================================
const IDM = { a: 1.6, b: 3.2, T: 1.3, s0: 2.6 };

export function stepVehicles(sim: Sim, dt: number) {
  for (const v of sim.vehicles) {
    v.flash = Math.max(0, v.flash - dt);
    if (v.parked || !v.route) continue;
    const route = v.route;
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);
    // nearest obstacle ahead
    let gap = Infinity;
    let leadV = 0;
    const consider = (ox: number, oz: number, oLen: number, oHalfW: number, oSpeed: number) => {
      const rx = ox - v.pos.x;
      const rz = oz - v.pos.z;
      const f = rx * fx + rz * fz;
      if (f <= 0 || f > 35) return;
      const l = rx * fz - rz * fx;
      if (Math.abs(l) > v.halfW + oHalfW + 0.35) return;
      const g = f - v.len / 2 - oLen / 2;
      if (g < gap) {
        gap = g;
        leadV = oSpeed;
      }
    };
    for (const o of sim.vehicles) {
      if (o === v) continue;
      const along = Math.sin(o.yaw) * fx + Math.cos(o.yaw) * fz;
      // at crossings the lower id has priority, so two cars never wait on each other
      if (!o.parked && along < 0.4 && o.id < v.id === false && along > -0.4) continue;
      consider(o.pos.x, o.pos.z, o.len, o.halfW, o.parked ? 0 : Math.max(0, o.v * along));
    }
    for (const p of sim.peds) consider(p.pos.x, p.pos.z, 0.5, 0.35, 0);
    if (WALKER.active) consider(WALKER.pos.x, WALKER.pos.z, 0.6, 0.4, 0); // drivers stop for you too
    // dead end / end of route ahead: brake for the U-turn
    const toEnd = v.dir > 0 ? route.total - v.s : v.s;
    if (toEnd - 2 < gap) {
      gap = Math.max(0.01, toEnd - 2);
      leadV = 0;
    }
    const sStar = IDM.s0 + v.v * IDM.T + (v.v * (v.v - leadV)) / (2 * Math.sqrt(IDM.a * IDM.b));
    let acc = IDM.a * (1 - Math.pow(v.v / v.v0, 4) - (gap === Infinity ? 0 : Math.pow(Math.max(sStar, 0) / Math.max(gap, 0.1), 2)));
    acc = THREE.MathUtils.clamp(acc, -9, IDM.a);
    v.accel = THREE.MathUtils.damp(v.accel, acc, 6, dt);
    v.v = Math.max(0, v.v + acc * dt);
    // U-turn at the end of the road: slow, swing across to the other lane
    if (toEnd < 3.2 && v.v < 1.2) {
      v.dir = (v.dir * -1) as 1 | -1;
      v.v = 1.2;
    }
    v.prev = { s: v.s, lat: v.lat, yaw: v.yaw, x: v.pos.x, z: v.pos.z, dir: v.dir };
    v.s = THREE.MathUtils.clamp(v.s + v.dir * v.v * dt, 0, route.total);
    const sm = sample(route, v.s);
    v.lat = THREE.MathUtils.damp(v.lat, v.dir * route.lane, 1.6, dt);
    const nx = sm.x + sm.nx * v.lat;
    const nz = sm.z + sm.nz * v.lat;
    const mx = nx - v.pos.x;
    const mz = nz - v.pos.z;
    if (mx * mx + mz * mz > 1e-6) {
      const target = Math.atan2(mx, mz);
      let d = target - v.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      v.yaw += d * Math.min(1, dt * 5);
    }
    v.pos.set(nx, 0, nz);
    v.wheel += (v.v * dt) / VEHICLE_DIMS[v.kind].wheelR;
  }
  // Hard constraint: a vehicle may never overlap another vehicle, a person or the visitor.
  // If its move would cause an overlap, it is put back where it was and stops (lower id has right of way).
  const order = [...sim.vehicles].sort((a, b) => b.id - a.id);
  for (const v of order) {
    if (v.parked || !v.prev) continue;
    const box = boxOf(v);
    let blocked = sim.vehicles.some((o) => o !== v && boxesOverlap(box, boxOf(o)));
    if (!blocked) blocked = sim.peds.some((p) => pushOutOfBox(p.pos.x, p.pos.z, 0.3, box) !== null);
    if (!blocked && WALKER.active) blocked = pushOutOfBox(WALKER.pos.x, WALKER.pos.z, 0.35, box) !== null;
    if (blocked) {
      v.s = v.prev.s;
      v.lat = v.prev.lat;
      v.yaw = v.prev.yaw;
      v.dir = v.prev.dir as 1 | -1;
      v.pos.set(v.prev.x, 0, v.prev.z);
      v.v = 0;
      v.accel = -3;
    }
  }
}

const boxOf = (v: Vehicle): Box => ({ x: v.pos.x, z: v.pos.z, yaw: v.yaw, hl: v.len / 2, hw: v.halfW });

/** Hard constraints for people: keep personal space, stay out of walls, cars and the visitor. */
export function separate(sim: Sim) {
  const walls = outsideSegments();
  const R = 0.3;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < sim.peds.length; i++) {
      const a = sim.peds[i];
      for (let j = i + 1; j < sim.peds.length; j++) {
        const b = sim.peds[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d >= R * 2 || d < 1e-6) continue;
        const push = (R * 2 - d) / 2;
        const ux = dx / d;
        const uz = dz / d;
        a.pos.x -= ux * push;
        a.pos.z -= uz * push;
        b.pos.x += ux * push;
        b.pos.z += uz * push;
      }
    }
  }
  for (const p of sim.peds) {
    for (const v of sim.vehicles) {
      const out = pushOutOfBox(p.pos.x, p.pos.z, R, boxOf(v));
      if (out) p.pos.set(out[0], 0, out[1]);
    }
    if (WALKER.active) {
      const dx = p.pos.x - WALKER.pos.x;
      const dz = p.pos.z - WALKER.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < R + 0.35 && d > 1e-6) p.pos.set(WALKER.pos.x + (dx / d) * (R + 0.35), 0, WALKER.pos.z + (dz / d) * (R + 0.35));
    }
    const [x, z] = resolveCircle(p.pos.x, p.pos.z, walls, R);
    p.pos.set(x, 0, z);
  }
  // Hard guarantee: nobody ends a frame inside a building or a vehicle. If the pushes above could not
  // resolve it (e.g. squeezed between a parked car and a wall, or drifting through a doorway), step back
  // to the last valid spot and turn around / abandon the road crossing.
  for (const p of sim.peds) {
    const bad = insideBuilding(p.pos.x, p.pos.z, 0) || sim.vehicles.some((v) => pushOutOfBox(p.pos.x, p.pos.z, R - 0.05, boxOf(v)) !== null);
    if (!bad) {
      if (p.prev) p.prev.valid = true;
      continue;
    }
    if (p.prev?.valid) {
      p.pos.set(p.prev.x, 0, p.prev.z);
      p.s = p.prev.s;
      p.lat = p.prev.lat;
      p.side = p.prev.side;
    }
    if (p.state === "cross" || p.state === "look") {
      p.state = "walk";
      p.nextCross = 10 + Math.random() * 20;
    } else if (p.state === "walk") p.dir = (p.dir * -1) as 1 | -1;
  }
}

// =====================================================================
// Pedestrians: shoulder walking, separation, collision with cars & buildings, safe crossing
// =====================================================================
export function stepPeds(sim: Sim, dt: number, t: number, cam: THREE.Vector3, tmp: THREE.Vector3) {
  for (const p of sim.peds) {
    p.prev = { x: p.pos.x, z: p.pos.z, s: p.s, lat: p.lat, side: p.side, valid: p.prev?.valid ?? false };
    p.timer -= dt;
    if (p.state === "wave") {
      p.v = 0;
      const target = Math.atan2(cam.x - p.pos.x, cam.z - p.pos.z);
      p.yaw = lerpAngle(p.yaw, target, dt * 6);
      if (p.timer <= 0) p.state = p.route ? "walk" : "idle";
      continue;
    }
    if (p.state === "idle" || !p.route) {
      p.v = 0;
      continue;
    }
    const route = p.route;
    const road = route.road;
    const shoulder = road.width / 2 + 1.1;
    let speed = p.speed;
    p.nextCross -= dt;

    if (p.state === "walk" && p.nextCross < 0) {
      p.state = "look";
      p.timer = 1.2 + Math.random();
    }
    if (p.state === "look") {
      speed = 0;
      // look both ways; wait while any moving car on this road is close and approaching
      const busy = sim.vehicles.some((v) => !v.parked && v.v > 0.5 && v.pos.distanceTo(p.pos) < 26 && approaching(v, p.pos));
      if (!busy && p.timer <= 0) p.state = "cross";
    }
    let lat = p.side * shoulder;
    if (p.state === "cross") {
      speed = 0;
      const target = -p.side * shoulder;
      const step = 1.25 * dt * Math.sign(target - p.lat);
      if (Math.abs(target - p.lat) <= Math.abs(step) + 0.01) {
        p.side = (p.side * -1) as 1 | -1;
        p.state = "walk";
        p.nextCross = 15 + Math.random() * 35;
        p.lat = target;
      } else p.lat += step;
      lat = p.lat;
    } else {
      p.lat = THREE.MathUtils.damp(p.lat, lat + p.latBias, 4, dt);
    }

    // separation from other pedestrians: sidestep and slow down
    p.latBias = THREE.MathUtils.damp(p.latBias, 0, 1.5, dt);
    for (const o of sim.peds) {
      if (o === p) continue;
      const d = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
      if (d < 0.9 && d > 0) {
        p.latBias += (p.id < o.id ? 0.6 : -0.6) * dt * 3;
        speed *= 0.6;
      }
    }

    // advance, turning back at road ends or walls
    let ns = p.s + p.dir * speed * dt;
    if (ns <= 0 || ns >= route.total) {
      p.dir = (p.dir * -1) as 1 | -1;
      ns = THREE.MathUtils.clamp(ns, 0, route.total);
    }
    const sm = sample(route, ns);
    let x = sm.x + sm.nx * p.lat;
    let z = sm.z + sm.nz * p.lat;
    if (p.state === "walk" && insideBuilding(x, z, 0.25)) {
      p.dir = (p.dir * -1) as 1 | -1;
      ns = p.s;
      const back = sample(route, ns);
      x = back.x + back.nx * p.lat;
      z = back.z + back.nz * p.lat;
    }

    // never overlap a car: push out of any car footprint (+ margin)
    for (const v of sim.vehicles) {
      const rx = x - v.pos.x;
      const rz = z - v.pos.z;
      if (rx * rx + rz * rz > 16) continue;
      const fx = Math.sin(v.yaw);
      const fz = Math.cos(v.yaw);
      const f = rx * fx + rz * fz;
      const l = rx * fz - rz * fx;
      const hl = v.len / 2 + 0.35;
      const hw = v.halfW + 0.35;
      if (Math.abs(f) < hl && Math.abs(l) < hw) {
        const pushL = hw - Math.abs(l);
        const pushF = hl - Math.abs(f);
        if (pushL < pushF) {
          const s = Math.sign(l) || 1;
          x += fz * s * pushL;
          z += -fx * s * pushL;
        } else {
          const s = Math.sign(f) || 1;
          x += fx * s * pushF;
          z += fz * s * pushF;
        }
      }
    }

    const mx = x - p.pos.x;
    const mz = z - p.pos.z;
    const moved = Math.hypot(mx, mz);
    p.v = moved / Math.max(dt, 1e-4);
    if (moved > 0.002) p.yaw = lerpAngle(p.yaw, Math.atan2(mx, mz), dt * 8);
    else if (p.state === "look") {
      // glance left and right before crossing
      const roadYaw = Math.atan2(sm.dx, sm.dz);
      p.yaw = lerpAngle(p.yaw, roadYaw + Math.sin(t * 2.2 + p.id) * 1.2 + Math.PI / 2 * -p.side, dt * 3);
    }
    p.s = ns;
    p.pos.set(x, 0, z);
  }
  void tmp;
}

function approaching(v: Vehicle, pos: THREE.Vector3) {
  const rx = pos.x - v.pos.x;
  const rz = pos.z - v.pos.z;
  return rx * Math.sin(v.yaw) + rz * Math.cos(v.yaw) > -2;
}

function lerpAngle(a: number, b: number, t: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * Math.min(1, t);
}

export function stepTrees(sim: Sim, t: number) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const palms = sim.trees.filter((x) => x.kind === "palm");
  for (const inst of sim.palmRefs) {
    palms.forEach((tr, i) => {
      if (i >= inst.count) return;
      e.set(Math.sin(t * 0.8 + tr.x) * 0.025, tr.rot, Math.cos(t * 0.6 + tr.z) * 0.025);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(tr.x, 0, tr.z), q, new THREE.Vector3(tr.s, tr.s, tr.s));
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
  }
}

