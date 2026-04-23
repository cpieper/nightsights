import * as THREE from "three";
import {
  propagateKepler,
  sampleOrbit,
  eclipticToEquatorial,
} from "./kepler.js";

const DEG = Math.PI / 180;

// Catalog of meteor-shower parent bodies — comets and the occasional rock
// (Phaethon). All orbital elements are J2000 heliocentric ecliptic
// osculating elements, pulled from JPL Horizons at a common epoch
// (2026-04-23 00:00 TDB). Positions are two-body propagations from this
// epoch and will drift from JPL's perturbed ephemerides over years —
// accurate within hours/days over a decade, degrading for longer spans.
// Refresh the catalog from JPL to re-anchor if the drift becomes visible.
//
// Each body has a `streams: []` array — one parent can seed multiple annual
// showers when Earth crosses the orbit at more than one point (e.g., Halley
// produces both η-Aquariids and Orionids).
const ELEMENTS_EPOCH = new Date("2026-04-23T00:00:00Z");

export const COMET_CATALOG = [
  {
    id: "1P",
    name: "1P/Halley",
    color: 0xffd580,
    elements: {
      a: 17.859,
      e: 0.96801,
      i: 162.173 * DEG,
      longNode: 59.407 * DEG,
      argPeri: 112.306 * DEG,
      epoch: ELEMENTS_EPOCH,
      meanAnomAtEpoch: 191.633 * DEG,
    },
    streams: [
      {
        name: "η Aquariids",
        peakMonth: 5, peakDay: 6, peakHour: 3,
        sigmaDays: 3.0, peakZHR: 55, tubeRadius: 0.030,
      },
      {
        name: "Orionids",
        peakMonth: 10, peakDay: 21, peakHour: 10,
        sigmaDays: 3.0, peakZHR: 20, tubeRadius: 0.030,
      },
    ],
  },
  {
    id: "2P",
    name: "2P/Encke",
    color: 0xff9966,
    elements: {
      a: 2.214,
      e: 0.8473,
      i: 11.348 * DEG,
      longNode: 334.019 * DEG,
      argPeri: 187.283 * DEG,
      epoch: ELEMENTS_EPOCH,
      meanAnomAtEpoch: 272.501 * DEG,
    },
    // Taurids are a notoriously broad complex — the "peak" dates are the
    // plateau centers, not sharp maxima. Wide sigma captures the weeks-long
    // activity plateau that really defines the shower experience.
    streams: [
      {
        name: "Southern Taurids",
        peakMonth: 10, peakDay: 10, peakHour: 0,
        sigmaDays: 8.0, peakZHR: 5, tubeRadius: 0.060,
      },
      {
        name: "Northern Taurids",
        peakMonth: 11, peakDay: 12, peakHour: 0,
        sigmaDays: 8.0, peakZHR: 5, tubeRadius: 0.060,
      },
    ],
  },
  {
    id: "C1861G1",
    name: "C/1861 G1 Thatcher",
    color: 0x8fd9b6,
    elements: {
      a: 56.244,
      e: 0.98300,
      i: 79.06 * DEG,
      longNode: 31.52 * DEG,
      argPeri: 213.54 * DEG,
      epoch: ELEMENTS_EPOCH,
      meanAnomAtEpoch: 141.22 * DEG,
    },
    streams: [
      {
        name: "Lyrids",
        peakMonth: 4, peakDay: 22, peakHour: 13,
        sigmaDays: 1.0, peakZHR: 18, tubeRadius: 0.020,
      },
    ],
  },
  {
    id: "8P",
    name: "8P/Tuttle",
    color: 0xd0b8e8,
    elements: {
      a: 5.709,
      e: 0.8207,
      i: 54.99 * DEG,
      longNode: 270.19 * DEG,
      argPeri: 207.47 * DEG,
      epoch: ELEMENTS_EPOCH,
      meanAnomAtEpoch: 122.76 * DEG,
    },
    streams: [
      {
        name: "Ursids",
        peakMonth: 12, peakDay: 22, peakHour: 11,
        sigmaDays: 1.0, peakZHR: 10, tubeRadius: 0.018,
      },
    ],
  },
  {
    id: "55P",
    name: "55P/Tempel-Tuttle",
    color: 0x9fe7ff,
    elements: {
      a: 10.3321,
      e: 0.90540,
      i: 162.487 * DEG,
      longNode: 235.406 * DEG,
      argPeri: 172.540 * DEG,
      epoch: ELEMENTS_EPOCH,
      meanAnomAtEpoch: 304.877 * DEG,
    },
    streams: [
      {
        name: "Leonids",
        peakMonth: 11, peakDay: 17, peakHour: 6,
        sigmaDays: 1.3, peakZHR: 15, tubeRadius: 0.025,
      },
    ],
  },
  {
    id: "109P",
    name: "109P/Swift-Tuttle",
    color: 0xffb380,
    elements: {
      a: 26.188,
      e: 0.96323,
      i: 112.887 * DEG,
      longNode: 139.868 * DEG,
      argPeri: 153.244 * DEG,
      epoch: ELEMENTS_EPOCH,
      meanAnomAtEpoch: 89.573 * DEG,
    },
    streams: [
      {
        name: "Perseids",
        peakMonth: 8, peakDay: 12, peakHour: 13,
        sigmaDays: 2.0, peakZHR: 100, tubeRadius: 0.035,
      },
    ],
  },
  {
    id: "3200",
    name: "3200 Phaethon",
    color: 0xc4a3ff,
    // An Apollo asteroid, not a comet — but it's the accepted parent of the
    // Geminids, shedding material via thermal stress near its 0.14-AU perihelion.
    elements: {
      a: 1.27146,
      e: 0.88968,
      i: 22.311 * DEG,
      longNode: 265.098 * DEG,
      argPeri: 322.301 * DEG,
      epoch: ELEMENTS_EPOCH,
      meanAnomAtEpoch: 269.173 * DEG,
    },
    streams: [
      {
        name: "Geminids",
        peakMonth: 12, peakDay: 14, peakHour: 7,
        sigmaDays: 2.0, peakZHR: 120, tubeRadius: 0.025,
      },
    ],
  },
];

export function createComets(root) {
  const entries = COMET_CATALOG.map((def) => {
    const orbitLine = buildOrbitLine(def.elements, def.color);
    root.add(orbitLine);

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 16, 12),
      new THREE.MeshBasicMaterial({ color: def.color }),
    );
    root.add(marker);

    const label = makeLabel(def.name, def.color);
    label.position.set(0, 0.04, 0);
    marker.add(label);

    return { ...def, marker };
  });

  const markers = Object.fromEntries(entries.map((e) => [e.name, e.marker]));

  return {
    update(date) {
      for (const c of entries) {
        const pEcl = propagateKepler(c.elements, date);
        const pEq = eclipticToEquatorial(pEcl);
        c.marker.position.set(pEq.x, pEq.y, pEq.z);
      }
    },
    markers,
  };
}

function buildOrbitLine(elements, color) {
  const pts = sampleOrbit(elements, 768);
  const positions = new Float32Array(pts.length * 3);
  for (let k = 0; k < pts.length; k++) {
    const eq = eclipticToEquatorial(pts[k]);
    positions[3 * k + 0] = eq.x;
    positions[3 * k + 1] = eq.y;
    positions[3 * k + 2] = eq.z;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.55,
  });
  return new THREE.LineLoop(geom, mat);
}

function makeLabel(text, color) {
  const canvas = document.createElement("canvas");
  const scale = 2;
  const pad = 6 * scale;
  const font = `${12 * scale}px system-ui, -apple-system, sans-serif`;
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const w = Math.ceil(metrics.width + pad * 2);
  const h = Math.ceil(16 * scale + pad * 2);
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d");
  c.font = font;
  c.fillStyle = "rgba(8,10,16,0.75)";
  c.fillRect(0, 0, w, h);
  c.strokeStyle = cssColor(color, 0.6);
  c.lineWidth = scale;
  c.strokeRect(0.5 * scale, 0.5 * scale, w - scale, h - scale);
  c.fillStyle = cssColor(color, 1.0);
  c.textBaseline = "middle";
  c.fillText(text, pad, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  const aspect = w / h;
  const height = 0.035;
  sprite.scale.set(height * aspect, height, 1);
  return sprite;
}

function cssColor(hex, alpha) {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}
