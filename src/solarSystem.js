import * as THREE from "three";
import * as Astronomy from "astronomy-engine";

// 1 AU in km (IAU definition). Used to convert real body radii to AU.
const AU_KM = 149_597_870.7;

// Visual radii in AU — planets are enlarged ~1000× relative to reality so they
// read at solar-system scale. Scientific scale comes from orbital geometry; the
// planet glyphs are intentionally schematic in "visual" mode.
const BODIES = [
  { name: "Mercury", body: Astronomy.Body.Mercury, radius: 0.012, trueKm:   2440, color: 0xb5a58a },
  { name: "Venus",   body: Astronomy.Body.Venus,   radius: 0.018, trueKm:   6052, color: 0xe8c591 },
  { name: "Earth",   body: Astronomy.Body.Earth,   radius: 0.020, trueKm:   6378, color: 0x4f94ff },
  { name: "Mars",    body: Astronomy.Body.Mars,    radius: 0.015, trueKm:   3390, color: 0xd96a3a },
];
const SUN_VISUAL_RADIUS = 0.08;
const SUN_GLOW_RADIUS = 0.14;
const SUN_TRUE_KM = 695_700;

export function createSolarSystem(root) {
  const { sun, glow } = addSun(root);

  const planets = BODIES.map((def) => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(def.radius, 24, 16),
      new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.85,
        metalness: 0.0,
      }),
    );
    root.add(mesh);

    const orbitLine = buildOrbitLine(def.body, def.color);
    root.add(orbitLine);

    return { ...def, mesh, orbitLine };
  });

  const earth = planets.find((p) => p.name === "Earth");

  function setScale(mode) {
    // mode: "visual" (current default) or "true" (physically correct radii).
    for (const p of planets) {
      const factor =
        mode === "true" ? p.trueKm / AU_KM / p.radius : 1;
      p.mesh.scale.setScalar(factor);
    }
    const sunFactor =
      mode === "true" ? SUN_TRUE_KM / AU_KM / SUN_VISUAL_RADIUS : 1;
    sun.scale.setScalar(sunFactor);
    // Glow scales with the same factor so it still suggests a halo.
    glow.scale.setScalar(sunFactor);
  }

  const meshes = { Sun: sun };
  for (const p of planets) meshes[p.name] = p.mesh;

  return {
    update(date) {
      for (const p of planets) {
        const v = Astronomy.HelioVector(p.body, date);
        p.mesh.position.set(v.x, v.y, v.z);
      }
    },
    earthMesh: earth.mesh,
    setScale,
    meshes,
  };
}

function addSun(root) {
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_VISUAL_RADIUS, 32, 20),
    new THREE.MeshBasicMaterial({ color: 0xffdd88 }),
  );
  root.add(sun);

  // Soft glow via an additive sprite-ish sphere.
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_GLOW_RADIUS, 32, 20),
    new THREE.MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  root.add(glow);
  return { sun, glow };
}

// One orbital period sampled as a closed loop at the reference epoch. For the
// inner planets the orbits are effectively stable on human timescales, so a
// static loop is accurate enough for visualization.
function buildOrbitLine(body, color) {
  const epoch = new Date("2026-01-01T00:00:00Z");
  const periodDays = approxPeriodDays(body);
  const samples = 256;
  const positions = new Float32Array(samples * 3);
  for (let i = 0; i < samples; i++) {
    const t = new Date(epoch.getTime() + (i / samples) * periodDays * 86400_000);
    const v = Astronomy.HelioVector(body, t);
    positions[3 * i + 0] = v.x;
    positions[3 * i + 1] = v.y;
    positions[3 * i + 2] = v.z;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.35,
  });
  return new THREE.LineLoop(geom, mat);
}

function approxPeriodDays(body) {
  // Sidereal periods, days. Sufficient for closing the orbit sample loop.
  switch (body) {
    case Astronomy.Body.Mercury: return 87.969;
    case Astronomy.Body.Venus:   return 224.701;
    case Astronomy.Body.Earth:   return 365.256;
    case Astronomy.Body.Mars:    return 686.980;
    default: return 365.256;
  }
}
