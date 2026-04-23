import * as Astronomy from "astronomy-engine";
import { feature } from "topojson-client";
import landTopo from "world-atlas/land-110m.json";

// Minimal 2D world-map overlay on an equirectangular projection.
// Land geometry is Natural Earth 1:110m (bundled via `world-atlas`), which
// is accurate enough for any click-to-pick ambiguity at ~1° resolution while
// staying under 60 KB of data.
//
// Drawing order per frame:
//   1. Ocean fill → 2. Continents → 3. Night shading (pixel-level twilight
//   gradient) → 4. Reference parallels (equator, tropics, polar circles) →
//   5. Subsolar and observer markers with labels.

const MAP_W = 360; // 1 pixel per degree of longitude
const MAP_H = 180; // 1 pixel per degree of latitude
const GEOCENTRIC_OBSERVER = new Astronomy.Observer(0, 0, 0);

const LAND_FEATURE = feature(landTopo, landTopo.objects.land);

const PARALLELS = [
  { lat: 66.56, label: "Arctic Circle", dash: [2, 5], opacity: 0.14 },
  { lat: 23.44, label: "Tropic of Cancer", dash: [5, 4], opacity: 0.22 },
  { lat: 0, label: "Equator", dash: null, opacity: 0.38 },
  { lat: -23.44, label: "Tropic of Capricorn", dash: [5, 4], opacity: 0.22 },
  { lat: -66.56, label: "Antarctic Circle", dash: [2, 5], opacity: 0.14 },
];

export function createGlobe({ container, onLocationPicked }) {
  const panel = document.createElement("div");
  panel.className = "globe-panel";

  const title = document.createElement("div");
  title.className = "globe-title";
  title.textContent = "Observer";
  panel.appendChild(title);

  const canvas = document.createElement("canvas");
  canvas.className = "globe-canvas";
  canvas.width = MAP_W;
  canvas.height = MAP_H;
  panel.appendChild(canvas);

  const info = document.createElement("div");
  info.className = "globe-info";
  panel.appendChild(info);

  container.appendChild(panel);

  const ctx = canvas.getContext("2d");

  let observer = null;
  let subsolar = { lat: 0, lon: 0 };
  let visibility = [];

  function draw() {
    drawOcean();
    drawLand();
    shadeNightSide();
    drawParallels();
    drawSunMarker(subsolar.lat, subsolar.lon);
    if (observer) drawObserverMarker(observer.lat, observer.lon);
  }

  function drawOcean() {
    ctx.fillStyle = "#0c1a2e";
    ctx.fillRect(0, 0, MAP_W, MAP_H);
  }

  function drawLand() {
    const geometries = collectGeometries(LAND_FEATURE);
    ctx.beginPath();
    for (const geom of geometries) {
      const polys =
        geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
      for (const poly of polys) {
        for (const ring of poly) {
          let prevX = null;
          for (let i = 0; i < ring.length; i++) {
            const [lon, lat] = ring[i];
            const x = lon + 180;
            const y = 90 - lat;
            // Break the path at antimeridian jumps so a polygon that crosses
            // ±180° doesn't draw a stray line across the whole map.
            if (prevX !== null && Math.abs(x - prevX) > 180) {
              ctx.moveTo(x, y);
            } else if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
            prevX = x;
          }
          ctx.closePath();
        }
      }
    }
    ctx.fillStyle = "#2d4258";
    ctx.fill("evenodd");
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  function shadeNightSide() {
    const img = ctx.getImageData(0, 0, MAP_W, MAP_H);
    const data = img.data;
    const slatR = (subsolar.lat * Math.PI) / 180;
    const slonR = (subsolar.lon * Math.PI) / 180;
    const sinSlat = Math.sin(slatR);
    const cosSlat = Math.cos(slatR);
    for (let py = 0; py < MAP_H; py++) {
      const lat = 90 - py - 0.5;
      const latR = (lat * Math.PI) / 180;
      const sinLat = Math.sin(latR);
      const cosLat = Math.cos(latR);
      for (let px = 0; px < MAP_W; px++) {
        const lon = px - 180 + 0.5;
        const lonR = (lon * Math.PI) / 180;
        const cosH =
          sinSlat * sinLat + cosSlat * cosLat * Math.cos(slonR - lonR);
        const t = Math.max(0, Math.min(1, (cosH + 0.12) / 0.24));
        const dim = 0.3 + 0.7 * t;
        const idx = (py * MAP_W + px) * 4;
        data[idx] *= dim;
        data[idx + 1] *= dim;
        data[idx + 2] *= dim;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function drawParallels() {
    ctx.lineWidth = 1;
    for (const p of PARALLELS) {
      const y = 90 - p.lat + 0.5;
      ctx.setLineDash(p.dash ?? []);
      ctx.strokeStyle = `rgba(255,255,255,${p.opacity})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(MAP_W, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawSunMarker(lat, lon) {
    const [x, y] = latLonToPixel(lat, lon);
    // Soft glow
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 14);
    glow.addColorStop(0, "rgba(255, 223, 128, 0.7)");
    glow.addColorStop(1, "rgba(255, 223, 128, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 14, y - 14, 28, 28);
    // Starburst rays
    ctx.strokeStyle = "#ffe188";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 2 * Math.PI;
      const r0 = 6, r1 = 10;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      ctx.stroke();
    }
    // Disk
    ctx.fillStyle = "#fff1b0";
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fill();
    drawLabel("Sun", x, y, "#ffe188");
  }

  function drawObserverMarker(lat, lon) {
    const [x, y] = latLonToPixel(lat, lon);
    ctx.fillStyle = "#8ab4ff";
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = "#8ab4ff";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, 2 * Math.PI);
    ctx.stroke();
    drawLabel("You", x, y, "#8ab4ff");
  }

  function drawLabel(text, x, y, color) {
    ctx.font =
      '600 10px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textBaseline = "middle";
    const w = ctx.measureText(text).width;
    const flip = x + 12 + w + 4 > MAP_W;
    const lx = flip ? x - 12 - w : x + 12;
    // Background chip for legibility over any shading.
    ctx.fillStyle = "rgba(8, 12, 22, 0.78)";
    ctx.fillRect(lx - 3, y - 7, w + 6, 13);
    ctx.fillStyle = color;
    ctx.fillText(text, lx, y);
  }

  function renderInfo() {
    if (!observer) {
      info.innerHTML =
        '<div class="globe-hint">Click the map to set a location</div>';
      return;
    }
    const header = `<div class="globe-obs">${formatLat(observer.lat)}, ${formatLon(observer.lon)}</div>`;
    if (!visibility.length) {
      info.innerHTML = header +
        '<div class="globe-hint">No active shower right now</div>';
      return;
    }
    const rows = visibility
      .map((v) => {
        const sky =
          v.solarAlt < -12
            ? "night"
            : v.solarAlt < -6
              ? "astro. twilight"
              : v.solarAlt < 0
                ? "twilight"
                : "day";
        const visible = v.solarAlt < -12 && v.radiantAlt > 0;
        const verdict = visible
          ? '<span class="yes">visible</span>'
          : '<span class="no">not visible</span>';
        const style = `color:${v.color}`;
        return `<div class="globe-row">
          <span class="name" style="${style}">${v.name}</span>
          <span class="detail">rad ${v.radiantAlt.toFixed(0)}° · sun ${v.solarAlt.toFixed(0)}° (${sky})</span>
          ${verdict}
        </div>`;
      })
      .join("");
    info.innerHTML = header + rows;
  }

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * MAP_W;
    const py = ((e.clientY - rect.top) / rect.height) * MAP_H;
    const lat = 90 - py;
    const lon = px - 180;
    observer = { lat, lon };
    draw();
    renderInfo();
    onLocationPicked?.(observer);
  });

  return {
    setDate(date) {
      subsolar = computeSubsolar(date);
    },
    setVisibility(list) {
      visibility = list;
    },
    redraw() {
      draw();
      renderInfo();
    },
    getObserver() {
      return observer;
    },
  };
}

function collectGeometries(featureOrCollection) {
  if (featureOrCollection.type === "FeatureCollection") {
    return featureOrCollection.features.map((f) => f.geometry);
  }
  return [featureOrCollection.geometry];
}

function latLonToPixel(lat, lon) {
  return [lon + 180, 90 - lat];
}

function computeSubsolar(date) {
  const eq = Astronomy.Equator(
    Astronomy.Body.Sun,
    date,
    GEOCENTRIC_OBSERVER,
    true,
    false,
  );
  const gast = Astronomy.SiderealTime(date);
  let lon = (eq.ra - gast) * 15;
  lon = ((lon + 540) % 360) - 180;
  return { lat: eq.dec, lon };
}

export function observerVisibility(date, observer, radiantRA, radiantDec) {
  const obs = new Astronomy.Observer(observer.lat, observer.lon, 0);
  const horRad = Astronomy.Horizon(
    date,
    obs,
    radiantRA,
    radiantDec,
    "normal",
  );
  const sun = Astronomy.Equator(Astronomy.Body.Sun, date, obs, true, false);
  const horSun = Astronomy.Horizon(date, obs, sun.ra, sun.dec, "normal");
  return { radiantAlt: horRad.altitude, solarAlt: horSun.altitude };
}

function formatLat(lat) {
  const hemi = lat >= 0 ? "N" : "S";
  return `${Math.abs(lat).toFixed(1)}°${hemi}`;
}

function formatLon(lon) {
  const hemi = lon >= 0 ? "E" : "W";
  return `${Math.abs(lon).toFixed(1)}°${hemi}`;
}
