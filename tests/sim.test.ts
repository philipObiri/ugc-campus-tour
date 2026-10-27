import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { boxesOverlap, pushOutOfBox, type Box } from "@/lib/collision";
import { lane, pointInPoly } from "@/lib/laneGeometry";
import { buildSim, separate, stepPeds, stepVehicles, type Vehicle } from "@/lib/sim";

const box = (v: Vehicle): Box => ({ x: v.pos.x, z: v.pos.z, yaw: v.yaw, hl: v.len / 2, hw: v.halfW });

describe("traffic and pedestrian physics", () => {
  it("never lets cars, people or walls pass through each other over 60 simulated seconds", () => {
    const sim = buildSim();
    const cam = new THREE.Vector3(0, 50, 0);
    const tmp = new THREE.Vector3();
    const dt = 1 / 30;
    let carCar = 0;
    let carPerson = 0;
    let personPerson = 0;
    let personInBuilding = 0;
    let moved = 0;
    const start = sim.vehicles.map((v) => v.pos.clone());

    for (let f = 0; f < 1800; f++) {
      stepVehicles(sim, dt);
      stepPeds(sim, dt, f * dt, cam, tmp);
      separate(sim);
      if (f < 5) continue; // let the spawn settle
      for (let i = 0; i < sim.vehicles.length; i++)
        for (let j = i + 1; j < sim.vehicles.length; j++) if (boxesOverlap(box(sim.vehicles[i]), box(sim.vehicles[j]), -0.05)) carCar++;
      for (const p of sim.peds) {
        for (const v of sim.vehicles) if (pushOutOfBox(p.pos.x, p.pos.z, 0.2, box(v))) carPerson++;
        if (lane.buildings.some((b) => pointInPoly(p.pos.x, p.pos.z, b.pts))) personInBuilding++;
      }
      for (let i = 0; i < sim.peds.length; i++)
        for (let j = i + 1; j < sim.peds.length; j++) if (sim.peds[i].pos.distanceTo(sim.peds[j].pos) < 0.5) personPerson++;
    }
    sim.vehicles.forEach((v, i) => {
      if (!v.parked && v.pos.distanceTo(start[i]) > 20) moved++;
    });

    expect({ carCar, carPerson, personPerson, personInBuilding }).toEqual({ carCar: 0, carPerson: 0, personPerson: 0, personInBuilding: 0 });
    // and the traffic actually flows (nothing is permanently jammed)
    expect(moved).toBeGreaterThan(sim.vehicles.filter((v) => !v.parked).length / 2);
  });
});
