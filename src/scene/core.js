// Renderer, camera, sky and lights. Realistic set-up: sRGB output, filmic (ACES) tone mapping,
// physically based light units, an environment map for soft ambient light and reflections,
// and an atmospheric sky with a sun that casts patches through the windows.
import * as THREE from 'three';
import { RoomEnvironment } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/environments/RoomEnvironment.js';
import { Sky } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/objects/Sky.js';

export const canvas = document.getElementById('scene');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.physicallyCorrectLights = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xBFD3E6);

// Soft, neutral ambient light and reflections for every standard material
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

export const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 2000);
camera.rotation.order = 'YXZ';

// Sky light from above, warm bounce from the oak floor below (lights ceilings and shaded walls)
export const hemi = new THREE.HemisphereLight(0xE6EEF8, 0xD9C7A8, 1.25);
scene.add(hemi);
scene.add(new THREE.AmbientLight(0xFFF8EE, 0.35));

export const sun = new THREE.DirectionalLight(0xFFF1DE, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 3;
scene.add(sun); scene.add(sun.target);

const sky = new Sky();
sky.scale.setScalar(1500);
const su = sky.material.uniforms;
su.turbidity.value = 5; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.8;
scene.add(sky);

export function configureSun(cfg) {
  sun.position.set(...cfg.pos);
  const s = cfg.shadow || 10;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 60 });
  sun.shadow.camera.updateProjectionMatrix();
  su.sunPosition.value.copy(sun.position).normalize();
}

// Overall daylight level follows the glass (VLT): darker glass, darker room.
export function setDaylight(vlt, tint) {
  sun.intensity = 3.4 * vlt / 100;
  sun.color.set(tint || 0xFFF1DE);
  renderer.toneMappingExposure = 0.8 + 0.3 * vlt / 100;
  hemi.intensity = 0.75 + 0.55 * vlt / 100;
}

export function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
