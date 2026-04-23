import * as THREE from "three";
import {
  sampleOrbit,
  eclipticToEquatorial,
  propagateFromMeanAnomaly,
  meanAnomalyAt,
  orbitalPeriodDays,
  stateFromE,
} from "./kepler.js";

const DAY_MS = 86_400_000;

// One comet → one orbit visualization (tube + particle clouds) → one or more
// showers. When a single parent feeds multiple annual showers (Halley for
// η-Aquariids + Orionids, Encke for Taurids), the orbit visuals are shared
// and the tube brightness tracks the MAX current ZHR across those showers.

const BACKGROUND_COUNT = 10000;
const FRESH_COUNT = 1500;
// Fallback fresh-trail half-width when no per-comet override is given. As a
// fraction of the orbital period, not a raw mean-anomaly constant — so a
// 1.4-year body and a 133-year body both show a visually consistent arc of
// fresh dust (~11° of mean anomaly here), regardless of how much wall-clock
// time that represents.
const FRESH_TRAIL_FRACTION_OF_PERIOD = 1 / 32;
const DISTANCE_SAMPLES = 2048;
// Heliocentric distance at which illuminated dust is at "unit" brightness.
// Above this, dust fades as ~1/r² (solar illumination law).
const ILLUMINATION_REF_AU = 1.5;
// Radiant line length (AU). Just a visual cue extending from Earth into the sky.
const RADIANT_LINE_LENGTH_AU = 0.8;
// Only show the radiant line when the comet's strongest shower is at least
// this fraction of its peak — keeps the scene uncluttered off-peak.
const RADIANT_VISIBILITY_THRESHOLD = 0.05;

export function createStreams(root, catalog) {
  const parents = catalog
    .filter((c) => c.streams && c.streams.length)
    .map((c) => ({ comet: c, orbit: buildOrbitVisuals(root, c) }));

  const showers = parents.flatMap(({ comet, orbit }) =>
    comet.streams.map((s) => makeShower(s, orbit, comet)),
  );

  const pickables = parents.map(({ comet, orbit }) => ({
    object: orbit.tubeMesh,
    tooltip: buildTooltipHTML(comet, orbit),
  }));

  return {
    pickables,
    update(date, earthState) {
      const evaluated = showers.map((sh) => ({ sh, zhr: sh.zhrAt(date) }));

      const maxZhrByOrbit = new Map();
      const peakByOrbit = new Map();
      for (const { sh, zhr } of evaluated) {
        maxZhrByOrbit.set(
          sh.orbit,
          Math.max(maxZhrByOrbit.get(sh.orbit) ?? 0, zhr),
        );
        peakByOrbit.set(
          sh.orbit,
          Math.max(peakByOrbit.get(sh.orbit) ?? 0, sh.peakZHR),
        );
      }

      for (const { orbit } of parents) {
        orbit.updateFresh(date);
        const zhr = maxZhrByOrbit.get(orbit) ?? 0;
        const peak = peakByOrbit.get(orbit) ?? 1;
        const zhrNorm = Math.min(1, zhr / peak);
        orbit.applyIntensity(zhrNorm, date);
        orbit.updateRadiant(earthState, zhrNorm);
      }

      return evaluated.map(({ sh, zhr }) => ({
        stream: sh.streamName,
        parent: sh.parentName,
        zhr,
        daysFromPeak: sh.daysFromNearestPeak(date),
        daysToNext: sh.daysToNextPeak(date),
        distanceAu: sh.orbit.distanceToPoint(
          earthState.x,
          earthState.y,
          earthState.z,
        ),
        radiantRA: sh.orbit.radiantState.ra,
        radiantDec: sh.orbit.radiantState.dec,
      }));
    },
  };
}

function buildOrbitVisuals(root, comet) {
  const tubeRadius = Math.max(...comet.streams.map((s) => s.tubeRadius));

  // Fresh-trail sigma: prefer an explicit per-comet `freshSigmaDays`; else
  // default to a fixed fraction of the orbital period. Convert to radians of
  // mean anomaly, which is what the trail math consumes.
  const periodDays = orbitalPeriodDays(comet.elements.a);
  const freshSigmaDays =
    comet.freshSigmaDays ?? FRESH_TRAIL_FRACTION_OF_PERIOD * periodDays;
  const freshSigmaM = (2 * Math.PI * freshSigmaDays) / periodDays;

  // Orbit curve for tube geometry (uniform in eccentric anomaly).
  const shape = sampleOrbit(comet.elements, 256).map((p) => {
    const eq = eclipticToEquatorial(p);
    return new THREE.Vector3(eq.x, eq.y, eq.z);
  });
  const curve = new THREE.CatmullRomCurve3(shape, true, "centripetal");
  const tubeMat = new THREE.MeshBasicMaterial({
    color: comet.color,
    transparent: true,
    opacity: 0.025,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const tubeMesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 512, tubeRadius, 10, true),
    tubeMat,
  );
  root.add(tubeMesh);

  // --- Dense sampling: positions AND velocities per sample ----------------
  // Velocities (AU/day, equatorial frame) are looked up by index when
  // computing the radiant for whichever sample is closest to Earth.
  const distPoints = new Float32Array(DISTANCE_SAMPLES * 3);
  const distVelocities = new Float32Array(DISTANCE_SAMPLES * 3);
  for (let k = 0; k < DISTANCE_SAMPLES; k++) {
    const E = (k / DISTANCE_SAMPLES) * 2 * Math.PI;
    const state = stateFromE(comet.elements, E);
    const posEq = eclipticToEquatorial(state.pos);
    const velEq = eclipticToEquatorial(state.vel);
    distPoints[3 * k + 0] = posEq.x;
    distPoints[3 * k + 1] = posEq.y;
    distPoints[3 * k + 2] = posEq.z;
    distVelocities[3 * k + 0] = velEq.x;
    distVelocities[3 * k + 1] = velEq.y;
    distVelocities[3 * k + 2] = velEq.z;
  }

  function closestSample(px, py, pz) {
    let bestIdx = 0, best2 = Infinity;
    for (let k = 0; k < DISTANCE_SAMPLES; k++) {
      const dx = distPoints[3 * k + 0] - px;
      const dy = distPoints[3 * k + 1] - py;
      const dz = distPoints[3 * k + 2] - pz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < best2) {
        best2 = d2;
        bestIdx = k;
      }
    }
    return { index: bestIdx, distance: Math.sqrt(best2) };
  }

  function distanceToPoint(px, py, pz) {
    return closestSample(px, py, pz).distance;
  }

  // --- Background cloud: time-weighted positions + per-vertex illumination --
  const { positions: bgPositions, colors: bgColors } =
    buildBackgroundCloud(comet.elements, tubeRadius, comet.color);
  const bgGeom = new THREE.BufferGeometry();
  bgGeom.setAttribute("position", new THREE.BufferAttribute(bgPositions, 3));
  bgGeom.setAttribute("color", new THREE.BufferAttribute(bgColors, 3));
  const bgMat = new THREE.PointsMaterial({
    vertexColors: true,
    size: 0.006,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  root.add(new THREE.Points(bgGeom, bgMat));

  // --- Fresh trail: tracks the comet; fades with comet's distance from Sun ---
  const freshOffsets = buildFreshOffsets(tubeRadius, freshSigmaM);
  const freshPositions = new Float32Array(FRESH_COUNT * 3);
  const freshGeom = new THREE.BufferGeometry();
  freshGeom.setAttribute(
    "position",
    new THREE.BufferAttribute(freshPositions, 3),
  );
  const freshMat = new THREE.PointsMaterial({
    color: 0xf5faff,
    size: 0.008,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  root.add(new THREE.Points(freshGeom, freshMat));

  // Track the comet's heliocentric distance to fade fresh-trail brightness
  // as 1/r² — dust is only visible when sunlit.
  let lastCometR = 1;

  function updateFresh(date) {
    const M0 = meanAnomalyAt(comet.elements, date);
    let sumR = 0;
    for (let i = 0; i < FRESH_COUNT; i++) {
      const off = freshOffsets[i];
      const p = propagateFromMeanAnomaly(comet.elements, M0 + off.dM);
      const eq = eclipticToEquatorial(p);
      freshPositions[3 * i + 0] = eq.x + off.ox;
      freshPositions[3 * i + 1] = eq.y + off.oy;
      freshPositions[3 * i + 2] = eq.z + off.oz;
      if (i === 0) {
        sumR = Math.sqrt(eq.x * eq.x + eq.y * eq.y + eq.z * eq.z);
      }
    }
    lastCometR = sumR;
    freshGeom.attributes.position.needsUpdate = true;
  }

  function applyIntensity(norm) {
    const illum = illuminationAt(lastCometR);
    tubeMat.opacity = 0.025 + 0.12 * norm;
    bgMat.opacity = 0.12 + 0.45 * norm;
    freshMat.opacity = (0.22 + 0.35 * norm) * illum;
  }

  // --- Radiant line: direction in sky the meteors appear to come from -----
  const radiantPositions = new Float32Array(6);
  const radiantGeom = new THREE.BufferGeometry();
  radiantGeom.setAttribute(
    "position",
    new THREE.BufferAttribute(radiantPositions, 3),
  );
  const radiantMat = new THREE.LineBasicMaterial({
    color: comet.color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const radiantLine = new THREE.Line(radiantGeom, radiantMat);
  root.add(radiantLine);

  // Computed radiant direction (filled in by updateRadiant each frame).
  // RA/Dec are in the J2000 equatorial frame — same frame Astronomy Engine
  // uses for observer alt/az calculations, so they're directly consumable.
  const radiantState = { ra: 0, dec: 0, valid: false };

  function updateRadiant(earthState, zhrNorm) {
    const { index } = closestSample(earthState.x, earthState.y, earthState.z);
    const svx = distVelocities[3 * index + 0];
    const svy = distVelocities[3 * index + 1];
    const svz = distVelocities[3 * index + 2];
    // Radiant = direction opposite of meteor's velocity in Earth's frame.
    // Meteor velocity in Earth frame = v_stream − v_earth, so radiant = v_earth − v_stream.
    const dx = earthState.vx - svx;
    const dy = earthState.vy - svy;
    const dz = earthState.vz - svz;
    const mag = Math.hypot(dx, dy, dz);
    if (mag === 0) {
      radiantState.valid = false;
      radiantMat.opacity = 0;
      return;
    }
    // RA in hours (0–24), Dec in degrees. These are the units Astronomy
    // Engine's Horizon() call expects.
    const raRad = Math.atan2(dy, dx);
    radiantState.ra = (((raRad * 12) / Math.PI) + 24) % 24;
    radiantState.dec = (Math.asin(dz / mag) * 180) / Math.PI;
    radiantState.valid = true;

    if (zhrNorm < RADIANT_VISIBILITY_THRESHOLD) {
      radiantMat.opacity = 0;
      return;
    }
    const k = RADIANT_LINE_LENGTH_AU / mag;
    radiantPositions[0] = earthState.x;
    radiantPositions[1] = earthState.y;
    radiantPositions[2] = earthState.z;
    radiantPositions[3] = earthState.x + dx * k;
    radiantPositions[4] = earthState.y + dy * k;
    radiantPositions[5] = earthState.z + dz * k;
    radiantGeom.attributes.position.needsUpdate = true;
    radiantMat.opacity = 0.35 + 0.45 * zhrNorm;
  }

  return {
    tubeMesh,
    distanceToPoint,
    updateFresh,
    applyIntensity,
    updateRadiant,
    radiantState,
    periodDays,
    tubeRadius,
    freshSigmaDays,
  };
}

function illuminationAt(r) {
  return Math.min(1, (ILLUMINATION_REF_AU / Math.max(r, 0.05)) ** 2);
}

function makeShower(streamDef, orbit, comet) {
  const { peakMonth, peakDay, peakHour = 6, sigmaDays, peakZHR } = streamDef;
  const peakFor = (year) => Date.UTC(year, peakMonth - 1, peakDay, peakHour);

  function daysFromNearestPeak(date) {
    const year = date.getUTCFullYear();
    let best = Infinity;
    for (const y of [year - 1, year, year + 1]) {
      const dt = (date.getTime() - peakFor(y)) / DAY_MS;
      if (Math.abs(dt) < Math.abs(best)) best = dt;
    }
    return best;
  }

  function daysToNextPeak(date) {
    const year = date.getUTCFullYear();
    let best = Infinity;
    for (const y of [year, year + 1]) {
      const dt = (peakFor(y) - date.getTime()) / DAY_MS;
      if (dt >= 0 && dt < best) best = dt;
    }
    return best;
  }

  function zhrAt(date) {
    const dt = daysFromNearestPeak(date);
    return peakZHR * Math.exp(-0.5 * (dt / sigmaDays) ** 2);
  }

  return {
    streamName: streamDef.name,
    parentName: comet.name,
    peakZHR,
    orbit,
    zhrAt,
    daysFromNearestPeak,
    daysToNextPeak,
  };
}

function buildTooltipHTML(comet, orbit) {
  const hex = "#" + comet.color.toString(16).padStart(6, "0");
  const days = Math.round(orbit.periodDays).toLocaleString();
  const years = orbit.periodDays / 365.25;
  const yearsLabel =
    years < 3 ? `${years.toFixed(2)} years` : `~${years.toFixed(1)} years`;

  const streamLines = comet.streams
    .map(
      (s) =>
        `<div class="stream-item">• ${s.name} — peak ${monthAbbrev(s.peakMonth)} ${s.peakDay}, ZHR ~${s.peakZHR}</div>`,
    )
    .join("");

  return `
    <div class="title" style="color:${hex}">${comet.name}</div>
    <div class="period">Orbital period: ${days} days (${yearsLabel})</div>
    <div class="streams-list">${streamLines}</div>
  `;
}

const MONTH_ABBREV = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function monthAbbrev(m) {
  return MONTH_ABBREV[m - 1];
}

function buildBackgroundCloud(elements, tubeRadius, baseColor) {
  const positions = new Float32Array(BACKGROUND_COUNT * 3);
  const colors = new Float32Array(BACKGROUND_COUNT * 3);
  const br = ((baseColor >> 16) & 0xff) / 255;
  const bg = ((baseColor >> 8) & 0xff) / 255;
  const bb = (baseColor & 0xff) / 255;

  for (let i = 0; i < BACKGROUND_COUNT; i++) {
    const M = Math.random() * 2 * Math.PI;
    const p = propagateFromMeanAnomaly(elements, M);
    const eq = eclipticToEquatorial(p);
    const [ox, oy, oz] = isotropicGaussian(tubeRadius * 0.55);
    const x = eq.x + ox, y = eq.y + oy, z = eq.z + oz;
    positions[3 * i + 0] = x;
    positions[3 * i + 1] = y;
    positions[3 * i + 2] = z;

    // Per-particle illumination: dust near the Sun scatters more light.
    const r = Math.sqrt(x * x + y * y + z * z);
    const illum = illuminationAt(r);
    colors[3 * i + 0] = br * illum;
    colors[3 * i + 1] = bg * illum;
    colors[3 * i + 2] = bb * illum;
  }
  return { positions, colors };
}

function buildFreshOffsets(tubeRadius, freshSigmaM) {
  const offsets = new Array(FRESH_COUNT);
  for (let i = 0; i < FRESH_COUNT; i++) {
    const [ox, oy, oz] = isotropicGaussian(tubeRadius * 0.3);
    offsets[i] = {
      dM: gaussian() * freshSigmaM,
      ox, oy, oz,
    };
  }
  return offsets;
}

function isotropicGaussian(sigma) {
  const r = Math.abs(gaussian()) * sigma;
  const phi = Math.random() * 2 * Math.PI;
  const cosTheta = 2 * Math.random() - 1;
  const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
  return [r * sinTheta * Math.cos(phi), r * sinTheta * Math.sin(phi), r * cosTheta];
}

function gaussian() {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
