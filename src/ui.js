// Simulation time controller.
//
// State: `simDate` is the single source of truth. The slider is a relative
// scrubber centered on `epoch` — the slider's value is (simDate − epoch) in
// days. Whenever simDate drifts outside the slider's ±range, epoch silently
// shifts to simDate so the scrubber stays usable at any era.
//
// Four inputs can mutate simDate:
//   - Slider drag (leaves epoch alone; just repositions simDate locally)
//   - Date input edit (re-anchors epoch = simDate)
//   - Step buttons ±1d/±1mo/±1y (month/year-aware; re-anchors if past range)
//   - Playback (ticks simDate forward; stops at slider end)

const DAY_MS = 86_400_000;

export function createTimeController({ onChange }) {
  const slider = document.getElementById("time-slider");
  const dateInput = document.getElementById("date-input");
  const btnNow = document.getElementById("btn-now");
  const btnPlay = document.getElementById("btn-play");
  const speedSelect = document.getElementById("speed");
  const stepButtons = document.querySelectorAll(".step-btn");

  const SLIDER_MIN = parseFloat(slider.min);
  const SLIDER_MAX = parseFloat(slider.max);

  let epoch = new Date();
  let simDate = new Date(epoch.getTime());
  let playing = false;
  let lastTick = 0;
  let suppressDateInput = false;

  function emit() {
    syncUI();
    onChange(simDate);
  }

  function syncUI() {
    const offsetDays = (simDate.getTime() - epoch.getTime()) / DAY_MS;
    // Keep slider representing simDate position relative to epoch.
    slider.value = String(Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, offsetDays)));
    // `value` setter on datetime-local re-renders the native picker; avoid
    // thrashing the input while the user is actively typing in it.
    if (!suppressDateInput) {
      dateInput.value = formatDateForInput(simDate);
    }
  }

  function setSimDate(newDate, rebaseIfOutOfRange = true) {
    simDate = newDate;
    if (rebaseIfOutOfRange) {
      const offsetDays = (simDate.getTime() - epoch.getTime()) / DAY_MS;
      if (offsetDays < SLIDER_MIN || offsetDays > SLIDER_MAX) {
        epoch = new Date(simDate.getTime());
      }
    }
    emit();
  }

  // --- Slider drag: repositions simDate within [epoch-range, epoch+range] ---
  slider.addEventListener("input", () => {
    const offset = parseFloat(slider.value);
    simDate = new Date(epoch.getTime() + offset * DAY_MS);
    if (!suppressDateInput) {
      dateInput.value = formatDateForInput(simDate);
    }
    onChange(simDate);
  });

  // --- Date input: user types/picks an absolute date; re-anchor epoch ---
  dateInput.addEventListener("focus", () => {
    suppressDateInput = true;
  });
  dateInput.addEventListener("blur", () => {
    suppressDateInput = false;
    // One last sync to show the authoritative simDate formatting.
    dateInput.value = formatDateForInput(simDate);
  });
  dateInput.addEventListener("change", () => {
    const d = parseDateFromInput(dateInput.value);
    if (!isNaN(d.getTime())) {
      epoch = new Date(d.getTime());
      setSimDate(d, false);
    }
  });

  // --- Step buttons: month/year-aware, re-anchors if outside slider range ---
  for (const btn of stepButtons) {
    btn.addEventListener("click", () => {
      const days = parseInt(btn.dataset.days ?? "0", 10);
      const months = parseInt(btn.dataset.months ?? "0", 10);
      const years = parseInt(btn.dataset.years ?? "0", 10);
      setSimDate(stepDate(simDate, days, months, years), true);
    });
  }

  // --- Now button: hard reset to wall-clock ---
  btnNow.addEventListener("click", () => {
    const d = new Date();
    epoch = d;
    setSimDate(d, false);
  });

  // --- Play / pause ---
  btnPlay.addEventListener("click", () => {
    playing = !playing;
    btnPlay.textContent = playing ? "Pause" : "Play";
    lastTick = performance.now();
  });

  function tick(now) {
    if (playing) {
      // Clamp dt so tab-switching or throttled background rAF doesn't warp
      // the simulation forward by years on the first frame back.
      const dt = Math.min((now - lastTick) / 1000, 0.1);
      const daysPerSec = parseFloat(speedSelect.value);
      const next = new Date(simDate.getTime() + dt * daysPerSec * DAY_MS);
      const nextOffset = (next.getTime() - epoch.getTime()) / DAY_MS;
      if (nextOffset < SLIDER_MIN || nextOffset > SLIDER_MAX) {
        // Stop at slider boundary rather than silently re-anchoring mid-play.
        playing = false;
        btnPlay.textContent = "Play";
        const clampedOffset = Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, nextOffset));
        simDate = new Date(epoch.getTime() + clampedOffset * DAY_MS);
      } else {
        simDate = next;
      }
      emit();
    }
    lastTick = now;
  }

  emit();

  return { tick, currentDate: () => simDate };
}

function stepDate(date, days, months, years) {
  const d = new Date(date.getTime());
  if (years) d.setUTCFullYear(d.getUTCFullYear() + years);
  if (months) d.setUTCMonth(d.getUTCMonth() + months);
  if (days) d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

// Format as the YYYY-MM-DDTHH:mm shape expected by <input type="datetime-local">,
// but using UTC components so display and parsing are consistent.
function formatDateForInput(d) {
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}

function parseDateFromInput(str) {
  // Append Z so the browser parses the value as UTC, not local time.
  if (!str) return new Date(NaN);
  return new Date(str + ":00Z");
}
