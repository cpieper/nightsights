import * as THREE from "three";
import * as Astronomy from "astronomy-engine";
import { createScene } from "./scene.js";
import { createSolarSystem } from "./solarSystem.js";
import { createComets, COMET_CATALOG } from "./comets.js";
import { createStreams } from "./streams.js";
import { createPicker } from "./picker.js";
import { createGlobe, observerVisibility } from "./globe.js";
import { createTimeController } from "./ui.js";

const canvas = document.getElementById("scene");
const { renderer, scene, camera, controls, eclipticRoot } = createScene(canvas);

const solarSystem = createSolarSystem(eclipticRoot);
const comets = createComets(eclipticRoot);
const streams = createStreams(eclipticRoot, COMET_CATALOG);

createPicker({ camera, canvas, pickables: streams.pickables });

// Scale toggle: swap between enlarged visual radii (default, makes planets
// pickable) and true radii (Earth becomes sub-pixel; emphasizes scale).
solarSystem.setScale("visual");
const btnScale = document.getElementById("btn-scale");
let scaleMode = "visual";
btnScale.addEventListener("click", () => {
  scaleMode = scaleMode === "visual" ? "true" : "visual";
  solarSystem.setScale(scaleMode);
  btnScale.textContent = `Scale: ${scaleMode === "visual" ? "Visual" : "True"}`;
});

const showerLabel = document.getElementById("shower-label");

// --- Globe overlay: day/night map + observer location picker ---------------
const globe = createGlobe({
  container: document.getElementById("globe-container"),
  onLocationPicked: () => {
    // Redraw visibility immediately after a click, using the latest reports.
    updateVisibility(lastReports, lastDate);
    globe.redraw();
  },
});
let lastReports = [];
let lastDate = new Date();

function updateVisibility(reports, date) {
  const obs = globe.getObserver();
  if (!obs) {
    globe.setVisibility([]);
    return;
  }
  const active = reports.filter((r) => r.zhr >= 1);
  const vis = active.map((r) => {
    const { radiantAlt, solarAlt } = observerVisibility(
      date,
      obs,
      r.radiantRA,
      r.radiantDec,
    );
    return {
      name: r.stream,
      color: colorForStream(r.stream),
      radiantAlt,
      solarAlt,
    };
  });
  globe.setVisibility(vis);
}

// Map stream → parent color. Looked up from the catalog once.
const STREAM_COLORS = Object.fromEntries(
  COMET_CATALOG.flatMap((c) =>
    c.streams.map((s) => [s.name, "#" + c.color.toString(16).padStart(6, "0")]),
  ),
);
function colorForStream(name) {
  return STREAM_COLORS[name] ?? "#e6e8ef";
}

const time = createTimeController({
  onChange: (date) => {
    solarSystem.update(date);
    comets.update(date);
    const earthState = Astronomy.HelioState(Astronomy.Body.Earth, date);
    const reports = streams.update(date, earthState);
    lastReports = reports;
    lastDate = date;
    renderShowerReadout(reports);
    globe.setDate(date);
    updateVisibility(reports, date);
    globe.redraw();
  },
});

// After the first onChange ran (inside createTimeController), Earth's mesh
// has a real position. Re-center the camera on Earth for a friendlier
// initial framing than staring at the Sun from above.
focusOnEarth();

// --- Camera lock: dropdown that makes the camera track a chosen body ------
const focusSelect = document.getElementById("focus-select");
const focusables = {
  Free: null,
  Sun: solarSystem.meshes.Sun,
  Mercury: solarSystem.meshes.Mercury,
  Venus: solarSystem.meshes.Venus,
  Earth: solarSystem.meshes.Earth,
  Mars: solarSystem.meshes.Mars,
};
for (const c of COMET_CATALOG) {
  focusables[c.name] = comets.markers[c.name];
}
for (const name of Object.keys(focusables)) {
  const opt = document.createElement("option");
  opt.value = name;
  opt.textContent = name;
  if (name === "Free") opt.selected = true;
  focusSelect.appendChild(opt);
}
let lockedMesh = null;
focusSelect.addEventListener("change", () => {
  lockedMesh = focusables[focusSelect.value] ?? null;
});

const tmpWorld = new THREE.Vector3();
const tmpDelta = new THREE.Vector3();

function applyCameraLock() {
  if (!lockedMesh) return;
  eclipticRoot.updateMatrixWorld(true);
  lockedMesh.getWorldPosition(tmpWorld);
  tmpDelta.copy(tmpWorld).sub(controls.target);
  controls.target.copy(tmpWorld);
  camera.position.add(tmpDelta);
}

function animate(now) {
  time.tick(now);
  applyCameraLock();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

function focusOnEarth() {
  eclipticRoot.updateMatrixWorld(true);
  const earthPos = new THREE.Vector3();
  solarSystem.earthMesh.getWorldPosition(earthPos);
  controls.target.copy(earthPos);
  // Fixed offset places the camera slightly above and to one side of Earth.
  // Distance of ~1.3 AU keeps Sun + all inner planets in the frame.
  camera.position.copy(earthPos).add(new THREE.Vector3(0.4, 0.6, 1.0));
  controls.update();
}

function renderShowerReadout(reports) {
  const active = reports
    .filter((r) => r.zhr >= 1)
    .sort((a, b) => b.zhr - a.zhr);

  if (active.length) {
    showerLabel.innerHTML = active
      .map((r) => {
        const dt = r.daysFromPeak;
        const rel =
          Math.abs(dt) < 0.5
            ? "at peak"
            : `${Math.abs(dt).toFixed(1)}d ${dt > 0 ? "after" : "before"} peak`;
        const dist = `to parent orbit ${r.distanceAu.toFixed(3)} AU`;
        return `<span class="active">${r.stream}</span> · ZHR ≈ ${r.zhr.toFixed(1)} · ${rel} · ${dist}`;
      })
      .join("  ·  ");
    return;
  }

  // No active shower — point toward whatever is coming up soonest.
  const next = reports
    .slice()
    .sort((a, b) => a.daysToNext - b.daysToNext)[0];
  if (next) {
    showerLabel.innerHTML = `<span class="dormant">No active shower</span> · next: ${next.stream} in ${next.daysToNext.toFixed(0)}d`;
  } else {
    showerLabel.textContent = "";
  }
}
