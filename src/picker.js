import * as THREE from "three";

// Event-driven hover picker. Updates the tooltip only on mousemove, so there's
// no per-frame raycast cost. While any mouse button is held (orbit-controls
// drag), the tooltip hides — raycasting against a moving camera during a drag
// is noisy and unhelpful.
export function createPicker({ camera, canvas, pickables }) {
  const tooltip = document.createElement("div");
  tooltip.className = "hover-tooltip";
  tooltip.style.display = "none";
  document.body.appendChild(tooltip);

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const objects = pickables.map((p) => p.object);
  const lookup = new Map(pickables.map((p) => [p.object.uuid, p]));

  function hide() {
    tooltip.style.display = "none";
    canvas.style.cursor = "";
  }

  function onMove(e) {
    if (e.buttons !== 0) {
      hide();
      return;
    }

    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(objects, false);
    if (hits.length) {
      const info = lookup.get(hits[0].object.uuid);
      if (info) {
        tooltip.innerHTML = info.tooltip;
        tooltip.style.display = "block";
        positionTooltip(tooltip, e.clientX, e.clientY);
        canvas.style.cursor = "help";
        return;
      }
    }
    hide();
  }

  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("mouseleave", hide);
}

function positionTooltip(el, x, y) {
  const pad = 14;
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Flip to the other side of the cursor if the tooltip would overflow.
  const left = x + pad + rect.width > vw ? x - pad - rect.width : x + pad;
  const top = y + pad + rect.height > vh ? y - pad - rect.height : y + pad;
  el.style.left = `${Math.max(0, left)}px`;
  el.style.top = `${Math.max(0, top)}px`;
}
