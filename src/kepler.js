// Two-body Keplerian propagation for heliocentric orbits.
// Reference frame convention: input elements are J2000 mean ecliptic.
// Output position is in the same J2000 ecliptic frame (AU).
// Use eclipticToEquatorial() to put results into the equatorial frame
// expected by children of the scene's eclipticRoot (which matches Astronomy
// Engine's HelioVector output).

const GAUSS_K = 0.01720209895; // rad/day, Gaussian gravitational constant
const MU_SUN = GAUSS_K * GAUSS_K; // AU^3 / day^2
const OBLIQUITY_J2000_RAD = (23.4392911 * Math.PI) / 180;
const DAY_MS = 86_400_000;

export function solveKepler(M, e, tol = 1e-10, maxIter = 60) {
  // Newton–Raphson on E - e sin E - M = 0.
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < maxIter; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

// Elements:
//   a         semi-major axis, AU
//   e         eccentricity
//   i         inclination, rad
//   longNode  longitude of ascending node (Ω), rad
//   argPeri   argument of perihelion (ω), rad
//   and either:
//     timeOfPerihelion: Date  — preferred for comets
//     or epoch: Date + meanAnomAtEpoch: rad
export function meanMotion(a) {
  return Math.sqrt(MU_SUN / (a * a * a)); // rad/day
}

export function orbitalPeriodDays(a) {
  return (2 * Math.PI) / meanMotion(a);
}

export function meanAnomalyAt(elements, date) {
  const n = meanMotion(elements.a);
  let M;
  if (elements.timeOfPerihelion) {
    const dt = (date.getTime() - elements.timeOfPerihelion.getTime()) / DAY_MS;
    M = n * dt;
  } else {
    const dt = (date.getTime() - elements.epoch.getTime()) / DAY_MS;
    M = elements.meanAnomAtEpoch + n * dt;
  }
  return wrapTwoPi(M);
}

export function propagateFromMeanAnomaly(elements, M) {
  const { a, e, i, longNode, argPeri } = elements;
  const E = solveKepler(wrapTwoPi(M), e);
  // Orbital-plane coordinates: x along perihelion, y perpendicular (toward motion).
  const xOp = a * (Math.cos(E) - e);
  const yOp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  return rotateToEcliptic(xOp, yOp, longNode, argPeri, i);
}

// State at a given eccentric anomaly: ecliptic position + velocity (AU, AU/day).
// Velocity from dE/dt = n / (1 - e cos E) and d(x_op, y_op)/dE.
export function stateFromE(elements, E) {
  const { a, e, i, longNode, argPeri } = elements;
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const sqrt1me2 = Math.sqrt(1 - e * e);
  const n = meanMotion(a);
  const dEdt = n / (1 - e * cosE);

  const xOp = a * (cosE - e);
  const yOp = a * sqrt1me2 * sinE;
  const vxOp = -a * sinE * dEdt;
  const vyOp = a * sqrt1me2 * cosE * dEdt;

  return {
    pos: rotateToEcliptic(xOp, yOp, longNode, argPeri, i),
    vel: rotateToEcliptic(vxOp, vyOp, longNode, argPeri, i),
  };
}

export function propagateKepler(elements, date) {
  return propagateFromMeanAnomaly(elements, meanAnomalyAt(elements, date));
}

// Sample the full orbit as a closed loop by varying eccentric anomaly.
// Uniform in E (not time) — gives more detail near perihelion where the body
// moves fastest, which is exactly where the orbit shape is sharpest.
export function sampleOrbit(elements, samples = 512) {
  const { a, e, i, longNode, argPeri } = elements;
  const b = a * Math.sqrt(1 - e * e);
  const pts = new Array(samples);
  for (let k = 0; k < samples; k++) {
    const E = (k / samples) * 2 * Math.PI;
    const xOp = a * (Math.cos(E) - e);
    const yOp = b * Math.sin(E);
    pts[k] = rotateToEcliptic(xOp, yOp, longNode, argPeri, i);
  }
  return pts;
}

function rotateToEcliptic(xOp, yOp, longNode, argPeri, inc) {
  // Rz(Ω) · Rx(i) · Rz(ω) · (xOp, yOp, 0)
  const cw = Math.cos(argPeri), sw = Math.sin(argPeri);
  const ci = Math.cos(inc), si = Math.sin(inc);
  const cO = Math.cos(longNode), sO = Math.sin(longNode);

  const x1 = cw * xOp - sw * yOp;
  const y1 = sw * xOp + cw * yOp;

  const x2 = x1;
  const y2 = ci * y1;
  const z2 = si * y1;

  const x = cO * x2 - sO * y2;
  const y = sO * x2 + cO * y2;
  const z = z2;
  return { x, y, z };
}

export function eclipticToEquatorial(v) {
  const c = Math.cos(OBLIQUITY_J2000_RAD);
  const s = Math.sin(OBLIQUITY_J2000_RAD);
  return {
    x: v.x,
    y: c * v.y - s * v.z,
    z: s * v.y + c * v.z,
  };
}

function wrapTwoPi(x) {
  const twoPi = 2 * Math.PI;
  return ((x % twoPi) + twoPi) % twoPi;
}
