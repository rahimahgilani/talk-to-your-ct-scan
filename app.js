import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/* ============================================================
   Talk to Your CT Scan — Powered by Agent8088
   Educational demo. NOT a medical diagnostic tool.
   ============================================================ */

const STRUCTURES = {
  trachea:      { color: 0x22d3ee, label: 'Trachea',      desc: 'The trachea (windpipe) is a rigid tube of cartilage that carries inhaled air from the larynx down into the chest, where it splits into the two main bronchi at the carina.' },
  bronchi:      { color: 0x38bdf8, label: 'Bronchi',      desc: 'The main bronchi split into lobar bronchi (three on the right, two on the left) and then segmental bronchi, conducting air deeper into each lobe of the lungs.' },
  bronchioles:  { color: 0x818cf8, label: 'Bronchioles',  desc: 'Bronchioles are the smallest conducting airways (under ~1 mm). They branch repeatedly and end in terminal bronchioles that deliver air to the alveoli.' },
  alveoli:      { color: 0xf472b6, label: 'Alveoli',      desc: 'Alveoli are tiny air sacs (~300 million per lung) wrapped in capillaries. This is where gas exchange happens: oxygen enters the blood and carbon dioxide leaves it.' },
  leftLung:     { color: 0x34d399, label: 'Left Lung',    desc: 'The left lung has two lobes and a cardiac notch to make room for the heart. It receives air via the left main bronchus.' },
  rightLung:    { color: 0x34d399, label: 'Right Lung',   desc: 'The right lung has three lobes and is larger than the left. It receives air via the right main bronchus.' },
  diaphragm:    { color: 0x7c93b5, label: 'Diaphragm',    desc: 'The diaphragm is a dome-shaped muscle below the lungs. It contracts and flattens on inhalation (pulling air in) and relaxes upward on exhalation (pushing air out).' },
};

// ---------- Scene setup ----------
const viewport = document.getElementById('viewport');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050a14, 0.012);

const camera = new THREE.PerspectiveCamera(45, viewport.clientWidth / viewport.clientHeight, 0.1, 200);
camera.position.set(0, 2, 16);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
viewport.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(viewport.clientWidth, viewport.clientHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
viewport.appendChild(labelRenderer.domElement);

// Post-processing bloom
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(viewport.clientWidth, viewport.clientHeight), 0.55, 0.6, 0.85);
composer.addPass(bloom);

// Controls — allow entering the lung
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.2;
controls.maxDistance = 45;
controls.target.set(0, 0.3, 0);

// Lights
scene.add(new THREE.AmbientLight(0x334466, 1.4));
const key = new THREE.DirectionalLight(0xbfe3ff, 2.2);
key.position.set(6, 8, 6);
scene.add(key);
const rim = new THREE.DirectionalLight(0x22d3ee, 1.6);
rim.position.set(-6, -2, -6);
scene.add(rim);

// Starfield backdrop
const stars = new THREE.BufferGeometry();
const starPos = [];
for (let i = 0; i < 600; i++) {
  starPos.push((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80);
}
stars.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0x88bbee, size: 0.06, transparent: true, opacity: 0.7 });
scene.add(new THREE.Points(stars, starMat));

// ---------- Helpers ----------
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function makeMat(color, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.35,
    metalness: opts.metalness ?? 0.15,
    transparent: true,
    opacity: opts.opacity ?? 0.92,
    emissive: color,
    emissiveIntensity: opts.emissiveIntensity ?? 0.18,
  });
  mat.userData.baseOpacity = opts.opacity ?? 0.92;
  return mat;
}

const groups = {};       // structure name -> THREE.Group
const meshes = {};       // structure name -> array of meshes (for highlight)
const labels = {};       // structure name -> CSS2DObject

function register(name, mesh) {
  if (!groups[name]) { groups[name] = new THREE.Group(); scene.add(groups[name]); }
  if (!meshes[name]) meshes[name] = [];
  groups[name].add(mesh);
  meshes[name].push(mesh);
  mesh.userData.structure = name;
}

function tube(points, radius, color, name) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, 32, radius, 12, false);
  const mesh = new THREE.Mesh(geo, makeMat(color));
  register(name, mesh);
  return mesh;
}

// ---------- Build the lungs (realistic shape with lobes) ----------
const lungMaterials = [];   // materials to fade for the lung layer
const lungShells = [];      // shell meshes to scale during breathing
const lungGroups = {};      // side -> group (for breathing scale)

function buildLung(side) {
  const sign = side === 'leftLung' ? -1 : 1;
  const geo = new THREE.SphereGeometry(1, 72, 48);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const x = v.x, y = v.y, z = v.z;
    // taper toward the apex (top)
    const apex = 1 - 0.55 * smoothstep(0.1, 1.0, y);
    // widen the base (bottom)
    const base = 1 + 0.15 * smoothstep(-1.0, -0.3, y);
    // flatten the medial surface (facing the heart)
    const medial = 1 - 0.42 * smoothstep(0.0, 1.0, -sign * x);
    // cardiac notch on the left lung (lower medial)
    let cardiac = 1;
    if (side === 'leftLung') {
      cardiac = 1 - 0.6 * smoothstep(0.0, 1.0, x) * smoothstep(-1.0, -0.15, y);
    }
    const r = apex * base * medial * cardiac;
    pos.setXYZ(i, sign * Math.abs(x) * r, y, z * r);
  }
  geo.computeVertexNormals();

  const g = new THREE.Group();

  // translucent outer shell
  const shellMat = makeMat(STRUCTURES[side].color, { opacity: 0.16, roughness: 0.5, emissiveIntensity: 0.05 });
  const shell = new THREE.Mesh(geo, shellMat);
  shell.scale.set(1.0, 1.85, 0.82);
  shell.position.set(sign * 1.55, 0.3, 0);
  g.add(shell);
  register(side, shell);
  lungMaterials.push(shellMat);
  lungShells.push(shell);
  lungGroups[side] = g;

  // inner glow core
  const coreMat = makeMat(STRUCTURES[side].color, { opacity: 0.06, emissiveIntensity: 0.12 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 24), coreMat);
  core.scale.copy(shell.scale);
  core.position.copy(shell.position);
  g.add(core);
  register(side, core);
  lungMaterials.push(coreMat);

  // lobe fissures (subtle darker lines on the surface)
  const fissureMat = new THREE.MeshBasicMaterial({ color: 0x0a1a30, transparent: true, opacity: 0.45, depthWrite: false });
  fissureMat.userData.baseOpacity = 0.45;
  lungMaterials.push(fissureMat);
  const fissures = side === 'rightLung'
    ? [{ y: 0.35, tilt: 0.0 }, { y: -0.25, tilt: 0.35 }]
    : [{ y: 0.05, tilt: 0.3 }];
  fissures.forEach((f) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.012, 8, 64), fissureMat);
    ring.scale.set(1.0, 1.85, 0.82);
    ring.position.set(sign * 1.55, 0.3 + f.y, 0);
    ring.rotation.z = f.tilt;
    ring.userData.structure = side;
    g.add(ring);
  });

  scene.add(g);
  return g;
}
buildLung('leftLung');
buildLung('rightLung');

// ---------- Diaphragm (dome-shaped muscle below the lungs) ----------
const diaphragmGroup = new THREE.Group();
scene.add(diaphragmGroup);
const diaphragmMat = makeMat(STRUCTURES.diaphragm.color, { opacity: 0.28, roughness: 0.6, emissiveIntensity: 0.08 });
const diaphragmGeo = new THREE.SphereGeometry(2.6, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.42);
const diaphragm = new THREE.Mesh(diaphragmGeo, diaphragmMat);
diaphragm.scale.set(1.0, 0.55, 0.8);
diaphragm.position.set(0, -1.9, 0);
diaphragm.rotation.x = Math.PI;
diaphragmGroup.add(diaphragm);
register('diaphragm', diaphragm);
const diaphragmBaseY = -1.9;

// ---------- Build the connected airway tree ----------
// Hierarchy: trachea -> main bronchi -> lobar bronchi -> segmental/bronchioles -> alveolar ducts -> alveoli
const treePaths = [];   // full paths (root -> terminal) for airflow
const terminals = [];   // terminal endpoints for alveoli

const tracheaTop = new THREE.Vector3(0, 3.6, 0);
const carina = new THREE.Vector3(0, 1.0, 0);

// Trachea
tube([tracheaTop, new THREE.Vector3(0, 2.6, 0), new THREE.Vector3(0, 1.8, 0), carina], 0.34, STRUCTURES.trachea.color, 'trachea');

// Main bronchi (right is steeper/more vertical, left more horizontal due to the heart)
const rightMainEnd = new THREE.Vector3(0.9, 0.55, 0.15);
const leftMainEnd = new THREE.Vector3(-0.9, 0.6, -0.1);
tube([carina, new THREE.Vector3(0.45, 0.78, 0.08), rightMainEnd], 0.26, STRUCTURES.bronchi.color, 'bronchi');
tube([carina, new THREE.Vector3(-0.45, 0.8, -0.05), leftMainEnd], 0.24, STRUCTURES.bronchi.color, 'bronchi');

// Lobar bronchi — right: upper/middle/lower; left: upper/lower
const rUpperEnd  = new THREE.Vector3(1.5, 0.95, 0.35);
const rMiddleEnd = new THREE.Vector3(1.7, 0.35, 0.1);
const rLowerEnd  = new THREE.Vector3(1.4, -0.15, 0.2);
const lUpperEnd  = new THREE.Vector3(-1.5, 0.9, -0.3);
const lLowerEnd  = new THREE.Vector3(-1.4, -0.1, -0.15);

tube([rightMainEnd, new THREE.Vector3(1.2, 0.75, 0.25), rUpperEnd], 0.18, STRUCTURES.bronchi.color, 'bronchi');
tube([rightMainEnd, new THREE.Vector3(1.3, 0.45, 0.12), rMiddleEnd], 0.16, STRUCTURES.bronchi.color, 'bronchi');
tube([rightMainEnd, new THREE.Vector3(1.15, 0.2, 0.18), rLowerEnd], 0.18, STRUCTURES.bronchi.color, 'bronchi');
tube([leftMainEnd, new THREE.Vector3(-1.2, 0.75, -0.2), lUpperEnd], 0.17, STRUCTURES.bronchi.color, 'bronchi');
tube([leftMainEnd, new THREE.Vector3(-1.15, 0.25, -0.12), lLowerEnd], 0.17, STRUCTURES.bronchi.color, 'bronchi');

// Recursive branching below each lobar bronchus (segmental -> bronchioles -> terminal)
function branch(start, dir, radius, depth, maxDepth, pathSoFar) {
  const len = 0.85 - depth * 0.1;
  const end = start.clone().add(dir.clone().multiplyScalar(len));
  tube([start.clone(), end.clone()], radius, STRUCTURES.bronchioles.color, 'bronchioles');
  const newPath = pathSoFar.concat([end.clone()]);

  if (depth >= maxDepth) {
    terminals.push(end.clone());
    treePaths.push(newPath);
    return;
  }

  const spread = 0.55;
  const up = new THREE.Vector3(0, 1, 0);
  const perp = new THREE.Vector3().crossVectors(dir, up).normalize();
  if (perp.lengthSq() < 0.01) perp.set(1, 0, 0);
  const d1 = dir.clone().add(perp.clone().multiplyScalar(spread)).normalize();
  const d2 = dir.clone().add(perp.clone().multiplyScalar(-spread)).normalize();
  d1.y -= 0.18; d2.y -= 0.18;
  d1.normalize(); d2.normalize();

  branch(end, d1, radius * 0.72, depth + 1, maxDepth, newPath);
  branch(end, d2, radius * 0.72, depth + 1, maxDepth, newPath);
}

const lobarEnds = [rUpperEnd, rMiddleEnd, rLowerEnd, lUpperEnd, lLowerEnd];
const lobarDirs = [
  new THREE.Vector3(0.5, 0.3, 0.3).normalize(),
  new THREE.Vector3(0.6, -0.2, 0.1).normalize(),
  new THREE.Vector3(0.4, -0.6, 0.2).normalize(),
  new THREE.Vector3(-0.5, 0.3, -0.3).normalize(),
  new THREE.Vector3(-0.4, -0.6, -0.2).normalize(),
];
const lobarPaths = [
  [tracheaTop, carina, rightMainEnd, rUpperEnd],
  [tracheaTop, carina, rightMainEnd, rMiddleEnd],
  [tracheaTop, carina, rightMainEnd, rLowerEnd],
  [tracheaTop, carina, leftMainEnd, lUpperEnd],
  [tracheaTop, carina, leftMainEnd, lLowerEnd],
];
lobarEnds.forEach((end, i) => {
  branch(end, lobarDirs[i], 0.13, 0, 3, lobarPaths[i]);
});

// ---------- Alveoli — anchored to the terminal bronchioles ----------
const alveoliGeo = new THREE.SphereGeometry(0.07, 10, 8);
const alveoliMat = makeMat(STRUCTURES.alveoli.color, { emissiveIntensity: 0.35, roughness: 0.3 });
const alveoliSpheres = [];

terminals.forEach((term) => {
  // alveolar duct: short connector from the terminal bronchiole
  const ductEnd = term.clone().add(new THREE.Vector3(0, -0.16, 0));
  tube([term, ductEnd], 0.05, STRUCTURES.bronchioles.color, 'bronchioles');
  // cluster of alveoli anchored around the duct end
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(alveoliGeo, alveoliMat);
    s.position.copy(ductEnd).add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.34,
      (Math.random() - 0.5) * 0.34,
      (Math.random() - 0.5) * 0.34
    ));
    register('alveoli', s);
    alveoliSpheres.push(s);
  }
});

// ---------- Labels ----------
function makeLabel(name) {
  const el = document.createElement('div');
  el.className = 'struct-label';
  el.textContent = STRUCTURES[name].label;
  const obj = new CSS2DObject(el);
  labels[name] = obj;
  return obj;
}
function labelPos(name) {
  const p = new THREE.Vector3();
  if (name === 'trachea') p.set(0, 2.6, 0);
  else if (name === 'bronchi') p.set(0, 0.8, 0);
  else if (name === 'bronchioles') p.set(0, -0.4, 0);
  else if (name === 'alveoli') p.set(0, -1.4, 0);
  else if (name === 'leftLung') p.set(-1.55, 0.3, 0);
  else if (name === 'rightLung') p.set(1.55, 0.3, 0);
  else if (name === 'diaphragm') p.set(0, -2.1, 0);
  return p;
}
Object.keys(STRUCTURES).forEach((name) => {
  const obj = makeLabel(name);
  obj.position.copy(labelPos(name));
  scene.add(obj);
});

// ---------- Highlighting ----------
const originalEmissive = {};
function highlight(name, on = true) {
  const list = meshes[name] || [];
  list.forEach((m) => {
    if (on) {
      if (!originalEmissive[m.uuid]) originalEmissive[m.uuid] = m.material.emissiveIntensity;
      m.material.emissiveIntensity = 1.4;
    } else {
      m.material.emissiveIntensity = originalEmissive[m.uuid] ?? 0.18;
    }
  });
}
function clearHighlights() {
  Object.keys(meshes).forEach((n) => highlight(n, false));
}

// ---------- Camera ----------
function animateCameraTo(endPos, endTarget, dur = 900) {
  const start = camera.position.clone();
  const startTarget = controls.target.clone();
  const t0 = performance.now();
  function step(now) {
    const t = Math.min((now - t0) / dur, 1);
    const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOut
    camera.position.lerpVectors(start, endPos, e);
    controls.target.lerpVectors(startTarget, endTarget, e);
    controls.update();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function focusOn(name, distance = 6) {
  const target = labelPos(name);
  const end = target.clone().add(new THREE.Vector3(0, 0.5, distance));
  animateCameraTo(end, target);
}

// ---------- Lung layer toggle ----------
let lungLayerOn = true;
let lungOpacity = 0.16;
function setLungLayer(on) {
  lungLayerOn = on;
  document.getElementById('btn-lung').classList.toggle('active', on);
}
function updateLungOpacity() {
  const dist = camera.position.distanceTo(controls.target);
  const auto = THREE.MathUtils.clamp((dist - 2.5) / 7, 0.05, 1);
  const target = lungLayerOn ? auto : 0;
  lungOpacity += (target - lungOpacity) * 0.08;
  lungMaterials.forEach((m) => {
    m.opacity = lungOpacity * m.userData.baseOpacity;
    m.visible = lungOpacity > 0.01;
  });
}

// ---------- View presets ----------
function goToView(view) {
  if (view === 'outside') {
    setLungLayer(true);
    animateCameraTo(new THREE.Vector3(0, 2, 16), new THREE.Vector3(0, 0.3, 0));
  } else if (view === 'airways') {
    setLungLayer(false);
    animateCameraTo(new THREE.Vector3(0, 1.2, 5), new THREE.Vector3(0, 0.5, 0));
  } else if (view === 'alveoli') {
    setLungLayer(false);
    animateCameraTo(new THREE.Vector3(0, -1.2, 3), new THREE.Vector3(0, -1.2, 0));
  }
}

// ---------- Airflow particles (follow real bronchial pathways) ----------
const airflowCurves = treePaths.map((p) => new THREE.CatmullRomCurve3(p));
const particles = [];
const particleGroup = new THREE.Group();
scene.add(particleGroup);
const particleGeo = new THREE.SphereGeometry(0.035, 8, 8);
const particleMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.9 });

let airflowActive = false;
let airflowDirection = 1; // 1 = inhale (root->alveoli), -1 = exhale (alveoli->root)

function spawnParticle() {
  const p = new THREE.Mesh(particleGeo, particleMat);
  p.userData.curveIndex = Math.floor(Math.random() * airflowCurves.length);
  p.userData.t = Math.random();
  p.userData.speed = 0.15 + Math.random() * 0.08;
  particleGroup.add(p);
  particles.push(p);
}
for (let i = 0; i < 60; i++) spawnParticle();

function updateAirflow(dt) {
  if (!airflowActive) { particleGroup.visible = false; return; }
  particleGroup.visible = true;
  particles.forEach((p) => {
    p.userData.t += p.userData.speed * dt * airflowDirection;
    if (p.userData.t > 1) {
      p.userData.t = 0;
      p.userData.curveIndex = Math.floor(Math.random() * airflowCurves.length);
    } else if (p.userData.t < 0) {
      p.userData.t = 1;
      p.userData.curveIndex = Math.floor(Math.random() * airflowCurves.length);
    }
    const curve = airflowCurves[p.userData.curveIndex];
    const pos = curve.getPointAt(p.userData.t);
    p.position.copy(pos);
    const scale = 0.5 + 0.7 * Math.sin(p.userData.t * Math.PI);
    p.scale.setScalar(scale);
  });
}

// ---------- Breathing simulation ----------
let breathing = false;
let breathPhase = 0;   // 0..1 (0 = start inhale, 0.5 = full inhale, 1 = end exhale)
let breathDirection = 1; // 1 = inhaling, -1 = exhaling

function startBreathing() {
  breathing = true;
  document.getElementById('btn-breathe').classList.add('active');
}
function stopBreathing() {
  breathing = false;
  document.getElementById('btn-breathe').classList.remove('active');
  // ease back to rest
  lungShells.forEach((s) => s.scale.set(1.0, 1.85, 0.82));
  diaphragm.position.y = diaphragmBaseY;
}

function updateBreathing(dt) {
  if (!breathing) return;
  // full cycle ~4s
  breathPhase += (dt / 4) * breathDirection;
  if (breathPhase >= 1) { breathPhase = 1; breathDirection = -1; }
  if (breathPhase <= 0) { breathPhase = 0; breathDirection = 1; }

  // 0 -> inhale (expand), 0.5 -> full, 1 -> exhale (contract)
  const expand = Math.sin(breathPhase * Math.PI); // 0 at ends, 1 at mid
  const scale = 1 + expand * 0.06;
  lungShells.forEach((s) => {
    s.scale.set(1.0 * scale, 1.85 * scale, 0.82 * scale);
  });
  // diaphragm descends on inhale, rises on exhale
  diaphragm.position.y = diaphragmBaseY - expand * 0.35;

  // airflow direction follows breathing
  airflowDirection = breathDirection;
}

// ---------- Agent ----------
const chatLog = document.getElementById('chat-log');
const activityList = document.getElementById('activity-list');
const selectionInfo = document.getElementById('selection-info');

const ACTIVITY_STEPS = [
  'Understood request',
  'Identified structure',
  'Retrieved information',
  'Selected visualization',
  'Updated 3D model',
  'Verified result',
];

function setActivity(steps) {
  activityList.innerHTML = '';
  steps.forEach((s, i) => {
    const li = document.createElement('li');
    li.textContent = s;
    if (i < steps.length - 1) li.className = 'done';
    else li.className = 'active';
    activityList.appendChild(li);
  });
}
function resetActivity() {
  activityList.innerHTML = '<li class="idle">Waiting for a request…</li>';
}

function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  return div;
}

function showSelection(name) {
  selectionInfo.textContent = STRUCTURES[name].label;
  selectionInfo.classList.remove('hidden');
  setTimeout(() => selectionInfo.classList.add('hidden'), 1800);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function runAgentSteps(structureName, finalText) {
  setActivity([ACTIVITY_STEPS[0]]);
  await sleep(350);
  setActivity(ACTIVITY_STEPS.slice(0, 2));
  await sleep(350);
  setActivity(ACTIVITY_STEPS.slice(0, 3));
  await sleep(350);
  setActivity(ACTIVITY_STEPS.slice(0, 4));
  clearHighlights();
  highlight(structureName, true);
  focusOn(structureName);
  showSelection(structureName);
  await sleep(450);
  setActivity(ACTIVITY_STEPS.slice(0, 5));
  await sleep(350);
  setActivity(ACTIVITY_STEPS.slice(0, 6));
  await sleep(250);
  addMessage('agent', finalText);
  setTimeout(resetActivity, 2500);
}

// Intent matching
function matchIntent(text) {
  const t = text.toLowerCase();
  if (/alveol|gas exchange|oxygen|carbon dioxide|co2/.test(t)) return 'alveoli';
  if (/bronchiole/.test(t)) return 'bronchioles';
  if (/bronch/.test(t)) return 'bronchi';
  if (/trachea|windpipe/.test(t)) return 'trachea';
  if (/left lung/.test(t)) return 'leftLung';
  if (/right lung/.test(t)) return 'rightLung';
  if (/hide.*lung|lung.*off|remove.*lung|hide.*tissue/.test(t)) return 'hideLungs';
  if (/show.*lung|lung.*on|restore.*lung/.test(t)) return 'showLungs';
  if (/inside|enter.*lung|take me inside|airway view/.test(t)) return 'inside';
  if (/lung/.test(t)) return 'leftLung';
  if (/diaphragm/.test(t)) return 'diaphragm';
  if (/breathe|breathing|inhale|exhale|respirat/.test(t)) return 'breathe';
  if (/airflow|air travel|path air|how air/.test(t)) return 'airflow';
  if (/teach|lesson|tour|guide/.test(t)) return 'teach';
  return null;
}

const RESPONSES = {
  trachea: 'The trachea is the windpipe — a rigid, cartilage-reinforced tube that carries air from your throat down into the chest. I\'ve highlighted it and moved the camera in. It then splits into the two main bronchi at the carina.',
  bronchi: 'These are the bronchi — the main bronchi split into lobar bronchi (three on the right, two on the left) and then segmental bronchi, conducting air deeper into each lobe. I\'ve highlighted the branching network.',
  bronchioles: 'Bronchioles are the smallest conducting airways, under about 1 mm wide. They branch repeatedly and end in terminal bronchioles that deliver air to the alveoli. I\'ve highlighted the branching network.',
  alveoli: 'Alveoli are tiny air sacs — about 300 million per lung — wrapped in a dense web of capillaries. This is where gas exchange happens: oxygen diffuses into the blood and carbon dioxide diffuses out. I\'ve highlighted the alveolar clusters.',
  leftLung: 'The left lung has two lobes and a cardiac notch to make room for the heart. It receives air through the left main bronchus. I\'ve highlighted it.',
  rightLung: 'The right lung has three lobes and is larger than the left. It receives air through the right main bronchus. I\'ve highlighted it.',
  diaphragm: 'The diaphragm is a dome-shaped muscle below the lungs. When it contracts and flattens, it pulls air into the lungs; when it relaxes upward, it pushes air out. I\'ve highlighted it.',
};

async function handleUserInput(text) {
  addMessage('user', text);
  const intent = matchIntent(text);

  if (intent === 'airflow') {
    await runAgentSteps('bronchi', 'Air travels: trachea → main bronchi → lobar bronchi → segmental bronchi → bronchioles → alveolar ducts → alveoli. I\'ve started the airflow animation so you can watch the path air takes as you inhale.');
    startAirflow();
    return;
  }
  if (intent === 'teach') {
    startTeach();
    return;
  }
  if (intent === 'breathe') {
    startBreathing();
    startAirflow();
    await runAgentSteps('diaphragm', 'I\'ve started the breathing simulation. Watch the lungs expand and the diaphragm descend as air flows in, then contract and rise as air flows out.');
    return;
  }
  if (intent === 'hideLungs') {
    setLungLayer(false);
    await runAgentSteps('bronchi', 'I\'ve hidden the lung tissue so you can see the internal airway tree clearly — trachea, bronchi, and bronchioles.');
    return;
  }
  if (intent === 'showLungs') {
    setLungLayer(true);
    await runAgentSteps('leftLung', 'I\'ve restored the lung tissue so you can see the full pulmonary system from the outside.');
    return;
  }
  if (intent === 'inside') {
    setLungLayer(false);
    await runAgentSteps('bronchi', 'I\'ve taken you inside the lungs. You can now see the branching airway tree — trachea, bronchi, and bronchioles.');
    return;
  }
  if (intent && RESPONSES[intent]) {
    await runAgentSteps(intent, RESPONSES[intent]);
    return;
  }

  // Fallback
  setActivity([ACTIVITY_STEPS[0]]);
  await sleep(400);
  setActivity(ACTIVITY_STEPS.slice(0, 3));
  await sleep(400);
  setActivity(ACTIVITY_STEPS.slice(0, 6));
  addMessage('agent', 'I can help you explore the respiratory system. Try asking me to "show me the bronchi", "explain the alveoli", "show me the path air takes", "hide the lungs", or "take me inside" — or press "Teach Me" for a guided tour.');
  setTimeout(resetActivity, 2500);
}

// ---------- Airflow button ----------
function startAirflow() {
  airflowActive = true;
  document.getElementById('btn-airflow').classList.add('active');
  clearHighlights();
  highlight('trachea', true);
  highlight('bronchi', true);
  highlight('bronchioles', true);
  highlight('alveoli', true);
  focusOn('bronchi', 8);
}
function stopAirflow() {
  airflowActive = false;
  document.getElementById('btn-airflow').classList.remove('active');
  clearHighlights();
}
document.getElementById('btn-airflow').addEventListener('click', () => {
  airflowActive ? stopAirflow() : startAirflow();
});
document.getElementById('btn-breathe').addEventListener('click', () => {
  if (breathing) { stopBreathing(); } else { startBreathing(); startAirflow(); }
});

// ---------- Teach Me ----------
const LESSONS = [
  { name: 'trachea', title: '1. Trachea', text: 'Air enters through your nose or mouth and travels down the trachea (windpipe), a rigid tube kept open by rings of cartilage.' },
  { name: 'bronchi', title: '2. Bronchi', text: 'At the carina, the trachea splits into the left and right main bronchi — one for each lung. These divide into lobar and segmental bronchi.' },
  { name: 'bronchioles', title: '3. Bronchioles', text: 'The bronchi branch into ever-smaller bronchioles, the finest conducting airways, which spread air throughout the lungs.' },
  { name: 'alveoli', title: '4. Alveoli', text: 'Bronchioles end in clusters of alveoli — tiny air sacs wrapped in capillaries. This is where the lungs meet the bloodstream.' },
  { name: 'alveoli', title: '5. Gas exchange', text: 'In the alveoli, oxygen diffuses into the blood while carbon dioxide diffuses out — the essential gas exchange that keeps you alive.' },
];
let teachIndex = 0;
let teaching = false;

function startTeach() {
  teaching = true;
  teachIndex = 0;
  document.getElementById('teach-controls').classList.remove('hidden');
  document.getElementById('btn-teach').classList.add('active');
  showLesson(0);
}
function showLesson(i) {
  const lesson = LESSONS[i];
  clearHighlights();
  highlight(lesson.name, true);
  focusOn(lesson.name);
  showSelection(lesson.name);
  addMessage('agent', lesson.title + '\n' + lesson.text);
  const bar = document.querySelector('#teach-progress .bar');
  if (bar) bar.style.width = ((i + 1) / LESSONS.length * 100) + '%';
  const next = document.getElementById('btn-next');
  next.textContent = i === LESSONS.length - 1 ? 'Finish' : 'Next →';
}
document.getElementById('btn-teach').addEventListener('click', () => {
  if (teaching) { stopTeach(); } else { startTeach(); }
});
document.getElementById('btn-next').addEventListener('click', () => {
  teachIndex++;
  if (teachIndex >= LESSONS.length) { stopTeach(); return; }
  showLesson(teachIndex);
});
function stopTeach() {
  teaching = false;
  document.getElementById('teach-controls').classList.add('hidden');
  document.getElementById('btn-teach').classList.remove('active');
  clearHighlights();
  addMessage('agent', 'That\'s the full journey of a breath — from the trachea all the way to gas exchange in the alveoli. Well done! 🎉');
}

// ---------- Reset ----------
document.getElementById('btn-reset').addEventListener('click', () => {
  stopAirflow();
  stopBreathing();
  stopTeach();
  clearHighlights();
  setLungLayer(true);
  camera.position.set(0, 2, 16);
  controls.target.set(0, 0.3, 0);
  controls.update();
});

// ---------- Labels toggle ----------
let labelsOn = true;
document.getElementById('btn-labels').addEventListener('click', () => {
  labelsOn = !labelsOn;
  Object.values(labels).forEach((l) => (l.element.style.display = labelsOn ? '' : 'none'));
  document.getElementById('btn-labels').classList.toggle('active', !labelsOn);
});

// ---------- Lung layer button ----------
document.getElementById('btn-lung').addEventListener('click', () => {
  setLungLayer(!lungLayerOn);
});

// ---------- View switcher ----------
document.querySelectorAll('.view-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    goToView(btn.dataset.view);
  });
});

// ---------- Chat wiring ----------
const input = document.getElementById('chat-input');
function send() {
  const v = input.value.trim();
  if (!v) return;
  input.value = '';
  handleUserInput(v);
}
document.getElementById('btn-send').addEventListener('click', send);
input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
document.querySelectorAll('.chip').forEach((c) => {
  c.addEventListener('click', () => { input.value = c.textContent; send(); });
});

// ---------- Raycast selection ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
renderer.domElement.addEventListener('click', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const all = Object.values(meshes).flat();
  const hits = raycaster.intersectObjects(all, false);
  if (hits.length) {
    const name = hits[0].object.userData.structure;
    if (name) {
      clearHighlights();
      highlight(name, true);
      showSelection(name);
      addMessage('agent', STRUCTURES[name].label + ': ' + STRUCTURES[name].desc);
    }
  }
});

// ---------- Render loop ----------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  controls.update();
  updateAirflow(dt);
  updateBreathing(dt);
  updateLungOpacity();
  composer.render();
  labelRenderer.render(scene, camera);
}
animate();

// ---------- Resize ----------
window.addEventListener('resize', () => {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  labelRenderer.setSize(w, h);
});

// ---------- Welcome ----------
addMessage('agent', 'Hi! I\'m Agent8088. I can see this 3D model of the respiratory system and control it for you.\n\nAsk me to "show me the bronchi", "explain the alveoli", "show me the path air takes", "hide the lungs", or "take me inside" — or press "Teach Me" for a guided tour.');
