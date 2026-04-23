import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { addStarfield } from "./stars.js";

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x05060a, 1);

  const scene = new THREE.Scene();

  // Ecliptic-aligned root: Astronomy Engine returns J2000 mean-equator vectors,
  // so we tilt the world by -obliquity to put the ecliptic plane on XZ.
  const OBLIQUITY_J2000 = THREE.MathUtils.degToRad(23.4392911);
  const eclipticRoot = new THREE.Group();
  eclipticRoot.rotation.x = -OBLIQUITY_J2000;
  scene.add(eclipticRoot);

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.001,
    5000,
  );
  camera.position.set(0, 1.6, 3.4);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.1;
  controls.maxDistance = 50;

  scene.add(new THREE.AmbientLight(0xffffff, 0.08));
  const sunLight = new THREE.PointLight(0xfff1d0, 2.2, 0, 0);
  scene.add(sunLight);

  // Real bright-star catalog lives in the ecliptic root so its equatorial
  // positions get the same obliquity rotation as the planets & streams,
  // putting the celestial pole 23.44° off the ecliptic pole as it should be.
  addStarfield(eclipticRoot);

  window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });

  return { renderer, scene, camera, controls, eclipticRoot };
}

