import * as THREE from "three";

// A compact list of ~65 naked-eye bright stars. RA in hours, Dec in degrees,
// mag is apparent visual magnitude. Positions are J2000 mean equator/equinox
// (close enough for a background celestial sphere). Skew toward stars in
// constellations that host our shower radiants — Leo, Perseus, Gemini,
// Lyra, Aquarius, Orion, Taurus, Ursa Minor.
const BRIGHT_STARS = [
  // Andromeda / Pegasus / Cassiopeia
  ["Alpheratz", 0.140, 29.090, 2.07],
  ["Caph", 0.152, 59.150, 2.28],
  ["Algenib", 0.220, 15.183, 2.83],
  ["Schedar", 0.675, 56.537, 2.24],
  ["γ Cassiopeiae", 0.945, 60.717, 2.47],
  ["Mirach", 1.162, 35.621, 2.07],
  ["Diphda", 0.727, -17.987, 2.04],
  ["Hamal", 2.120, 23.463, 2.00],
  ["Almach", 2.065, 42.330, 2.26],
  ["Achernar", 1.629, -57.237, 0.46],
  // Perseus (Perseid radiant)
  ["Algol", 3.136, 40.956, 2.12],
  ["Mirfak", 3.405, 49.861, 1.79],
  ["Atik", 3.154, 47.788, 3.00],
  // Taurus (Taurid radiant)
  ["Aldebaran", 4.599, 16.509, 0.85],
  ["Elnath", 5.438, 28.608, 1.65],
  // Auriga
  ["Capella", 5.278, 45.998, 0.08],
  // Orion (Orionid radiant)
  ["Rigel", 5.242, -8.202, 0.13],
  ["Bellatrix", 5.419, 6.350, 1.64],
  ["Mintaka", 5.533, -0.299, 2.23],
  ["Alnilam", 5.604, -1.202, 1.69],
  ["Alnitak", 5.679, -1.943, 1.79],
  ["Saiph", 5.796, -9.669, 2.09],
  ["Betelgeuse", 5.919, 7.407, 0.50],
  // Gemini (Geminid radiant)
  ["Alhena", 6.629, 16.399, 1.93],
  ["Castor", 7.577, 31.889, 1.58],
  ["Pollux", 7.755, 28.026, 1.14],
  // Canis Major / Minor
  ["Sirius", 6.752, -16.716, -1.46],
  ["Mirzam", 6.378, -17.956, 1.98],
  ["Adhara", 6.977, -28.972, 1.50],
  ["Procyon", 7.655, 5.225, 0.34],
  // Carina / Vela
  ["Canopus", 6.399, -52.696, -0.72],
  // Hydra / Leo (Leonid radiant)
  ["Alphard", 9.460, -8.659, 1.98],
  ["Regulus", 10.139, 11.967, 1.35],
  ["Algieba", 10.333, 19.842, 2.01],
  ["Zosma", 11.235, 20.524, 2.56],
  ["Denebola", 11.818, 14.572, 2.14],
  // Ursa Major (Big Dipper) + Ursa Minor (Ursid radiant)
  ["Dubhe", 11.062, 61.751, 1.79],
  ["Merak", 11.030, 56.383, 2.37],
  ["Alioth", 12.900, 55.960, 1.77],
  ["Mizar", 13.399, 54.925, 2.27],
  ["Alkaid", 13.792, 49.313, 1.86],
  ["Polaris", 2.530, 89.264, 1.98],
  ["Kochab", 14.845, 74.156, 2.08],
  // Virgo / Corvus / Crux / Centaurus
  ["Spica", 13.420, -11.161, 0.98],
  ["Gienah Corvi", 12.263, -17.542, 2.59],
  ["Gacrux", 12.520, -57.113, 1.63],
  ["Acrux", 12.443, -63.099, 0.77],
  ["Mimosa", 12.795, -59.689, 1.25],
  ["Hadar", 14.064, -60.373, 0.61],
  ["Rigil Kentaurus", 14.660, -60.834, -0.01],
  // Boötes / Corona Borealis
  ["Arcturus", 14.261, 19.182, -0.05],
  ["Alphecca", 15.578, 26.715, 2.22],
  // Scorpius / Ophiuchus
  ["Antares", 16.490, -26.432, 0.96],
  ["Dschubba", 16.006, -22.622, 2.29],
  ["Rasalhague", 17.582, 12.560, 2.08],
  // Draco
  ["Eltanin", 17.943, 51.489, 2.24],
  // Lyra (Lyrid radiant)
  ["Vega", 18.615, 38.784, 0.03],
  // Aquila
  ["Altair", 19.847, 8.868, 0.77],
  // Cygnus
  ["Sadr", 20.371, 40.257, 2.23],
  ["Deneb", 20.690, 45.280, 1.25],
  // Pavo / Grus / Piscis Austrinus
  ["Peacock", 20.428, -56.735, 1.94],
  ["Alnair", 22.137, -46.961, 1.74],
  ["Fomalhaut", 22.961, -29.622, 1.16],
  // Aquarius (η-Aquariid radiant region)
  ["Sadalsuud", 21.526, -5.571, 2.90],
  ["Sadalmelik", 22.097, -0.320, 2.94],
  // Pegasus (second wing)
  ["Markab", 23.080, 15.205, 2.49],
  ["Scheat", 23.063, 28.083, 2.42],
];

const SPHERE_RADIUS_AU = 400;

export function addStarfield(root) {
  const count = BRIGHT_STARS.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const [, raHours, decDeg, mag] = BRIGHT_STARS[i];
    const raRad = (raHours * 15 * Math.PI) / 180;
    const decRad = (decDeg * Math.PI) / 180;
    const cosDec = Math.cos(decRad);
    // Equatorial J2000 cartesian; the eclipticRoot's −obliquity rotation
    // then takes this to ecliptic-aligned world space automatically.
    positions[3 * i + 0] = SPHERE_RADIUS_AU * cosDec * Math.cos(raRad);
    positions[3 * i + 1] = SPHERE_RADIUS_AU * cosDec * Math.sin(raRad);
    positions[3 * i + 2] = SPHERE_RADIUS_AU * Math.sin(decRad);

    // Brightness: 2.512^(−mag) is the Pogson ratio. Normalize so mag 0 ≈ 1,
    // clamp so very dim stars still render at minimum contrast.
    const b = Math.min(1.5, Math.pow(2.512, -mag));
    const level = Math.max(0.35, Math.min(1, b));
    colors[3 * i + 0] = level;
    colors[3 * i + 1] = level;
    colors[3 * i + 2] = level;

    // Pixel size scaled by the same factor, with a floor so dim stars remain
    // visible. `sizeAttenuation: false` keeps these as screen-pixel sizes so
    // stars don't grow/shrink with zoom, matching real-sky behavior.
    sizes[i] = Math.max(0.8, 1.6 * Math.pow(2.512, -mag / 2.5));
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

  // Custom shader so per-vertex `size` takes effect with sizeAttenuation=false.
  const mat = new THREE.ShaderMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    uniforms: {
      basePx: { value: 2.0 },
    },
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      uniform float basePx;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = basePx * size;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        // Soft round point.
        vec2 uv = gl_PointCoord - 0.5;
        float r2 = dot(uv, uv);
        float a = smoothstep(0.25, 0.0, r2);
        gl_FragColor = vec4(vColor, a);
      }
    `,
  });

  root.add(new THREE.Points(geom, mat));
}
