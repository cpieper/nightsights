# nightsights

A lightweight browser visualization of meteor-shower dust streams in the inner solar system.

Earth sweeps through clouds of cometary dust a handful of times each year — that's what meteor showers are. `nightsights` shows the orbits of the parent bodies, the stylized dust streams along those orbits, Earth's position as it crosses them, and a clickable globe that tells you whether the current shower's radiant is above your local horizon.

## What it shows

- **7 parent bodies** with osculating orbital elements from JPL Horizons: 55P/Tempel-Tuttle, 109P/Swift-Tuttle, 1P/Halley, 2P/Encke, 8P/Tuttle, 3200 Phaethon, C/1861 G1 Thatcher.
- **10 annual showers** driven off those parents: Leonids, Perseids, Geminids, η Aquariids, Orionids, Southern/Northern Taurids, Ursids, Lyrids.
- **Per-shower Gaussian ZHR** model peaking on each shower's calendar maximum.
- **Dust stream visuals**: translucent tube along each parent's orbit; a background particle cloud weighted by Kepler's 2nd law (density piles up at aphelion); a dynamic "fresh trail" tracking the parent in mean anomaly; 1/r² vertex-color illumination so dust fades into the outer solar system.
- **Radiant line** from Earth into the sky during active showers, computed from relative velocity (v_earth − v_stream).
- **Real star catalog** — ~65 bright named stars at their J2000 positions, so radiants land in the correct constellations.
- **2D globe overlay** (Natural Earth coastlines) with day/night shading, reference parallels, and click-to-pick observer location with per-shower solar-altitude and radiant-altitude readouts.

## Running locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default http://localhost:5173).

Static production build:

```bash
npm run build
```

## Controls

- **Time slider** — scrub ±2 years around a rolling anchor. Step buttons (±1d / ±1mo / ±1y) nudge by exact calendar units. The date field accepts typed or picked UTC dates.
- **Play / speed** — from ¼ day/s up to 1 year/s. Pauses at slider bounds.
- **Focus dropdown** — lock the camera to any body.
- **Scale toggle** — "Visual" (planets enlarged ~1000× for selectability) vs. "True" (real IAU radii; Earth becomes sub-pixel).
- **Hover** an orbit tube for parent body, orbital period, and hosted showers.
- **Click** the globe to set an observer location.

## Known simplifications

This is a scaffold, not a research tool.

- **Two-body propagation.** Positions come from Keplerian elements at a 2026-04-23 epoch. Over a decade they drift from JPL's perturbed ephemerides by minutes to hours for position, not for orbit shape.
- **Gaussian ZHR.** Single annual peak per shower. No wings, no outbursts, no storm years (1999 Leonids, 2022 τ-Herculids). Those would require per-trail N-body modeling.
- **Parent orbit ≠ stream orbit.** For older streams (Taurids, Ursids, Halley, Lyrids) the meteoroid stream has precessed away from the parent's current osculating orbit, so at peak Earth lies outside the tube. This is a real phenomenon, not a rendering bug; for the younger streams (Leonids, Perseids, Geminids) Earth is comfortably inside the tube at peak.
- **No secondary dust sources.** Asteroid-family streams, fragment trails, and interstellar grains are not modeled.

## Data sources and attributions

- Planetary positions: [Astronomy Engine](https://github.com/cosinekitty/astronomy) (MIT), Don Cross — VSOP87-based pure-JS ephemerides.
- Comet/asteroid orbital elements: [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) (NASA/JPL/Caltech), fetched at a common 2026-04-23 TDB epoch.
- Shower dates and ZHR values: International Meteor Organization annual calendar, standard published values.
- Continent outlines: [Natural Earth](https://www.naturalearthdata.com/) 1:110m land (public domain), bundled via the `world-atlas` npm package.
- Bright star positions: hand-curated selection from standard astronomical catalogs (Hipparcos / Bright Star Catalog), J2000 mean positions.

## Architecture

- `src/kepler.js` — Kepler solver, orbit sampling, ecliptic↔equatorial rotations.
- `src/scene.js` — Three.js scene, camera, orbit controls, ecliptic-aligned root.
- `src/solarSystem.js` — Sun + inner planets; visual/true scale swap.
- `src/comets.js` — parent-body catalog and orbit-line visuals.
- `src/streams.js` — dust tubes, particle clouds, fresh trails, radiant lines.
- `src/stars.js` — bright-star catalog + custom-shader rendering.
- `src/globe.js` — 2D world-map overlay with day/night and observer math.
- `src/picker.js` — raycaster + hover tooltip.
- `src/ui.js` — time controller (single-source-of-truth simulated date).
- `src/main.js` — wiring.

## License

MIT — see [LICENSE](./LICENSE).
