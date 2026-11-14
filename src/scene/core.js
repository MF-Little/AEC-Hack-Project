// Renderer, camera and lights. One instance for the whole app.
import * as THREE from 'three';

export const canvas = document.getElementById('scene');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xF3F2EE);
scene.fog = new THREE.Fog(0xF3F2EE, 24, 90);

export const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 250);
camera.rotation.order = 'YXZ';

export const hemi = new THREE.HemisphereLight(0xffffff, 0xD6D3CC, 0.75);
scene.add(hemi);
scene.add(new THREE.AmbientLight(0xffffff, 0.2));

export const sun = new THREE.DirectionalLight(0xffffff, 0.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun); scene.add(sun.target);

export function configureSun(cfg) {
  sun.position.set(...cfg.pos);
  const s = cfg.shadow || 10;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 50 });
  sun.shadow.camera.updateProjectionMatrix();
}

export function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
