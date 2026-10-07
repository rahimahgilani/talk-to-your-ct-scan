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
  trachea:      { color: 0x22d3ee, label: 'Trachea',      desc: 'The trachea (windpipe) is a rigid tube of cartilage that carries inhaled air from the larynx down into the chest, where it splits into the two main bronchi.' },
  bronchi:      { color: 0x38bdf8, label: 'Main Bronchi', desc: 'The main (primary) bronchi are the two large branches of the trachea — one to each lung. They conduct air into the lungs and further divide into smaller bronchi.' },
  bronchioles:  { color: 0x818cf8, label: 'Bronchioles',  desc: 'Bronchioles are the smallest conducting airways (under ~1 mm). They branch repeatedly and end in terminal bronchioles that deliver air to the alveoli.' },
  alveoli:      { color: 0xf472b6, label: 'Alveoli',      desc: 'Alveoli are tiny air sacs (~300 million per lung) wrapped in capillaries. This is where gas exchange happens: oxygen enters the blood and carbon dioxide leaves it.' },
  leftLung:     { color: 0x34d399, label: 'Left Lung',    desc: 'The left lung has two lobes and is slightly smaller to make room for the heart. It receives air via the left main bronchus.' },
  rightLung:    { color: 0x34d399, label: 'Right Lung',   desc: 'The right lung has three lobes and is larger than the left. It receives air via the right main bronchus.' },
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

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 4;
controls.maxDistance = 40;
controls.target.set(0, 0.5, 0);

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

// ---------- Build the anatomy ----------
const groups = {};       // structure name -> THREE.Group
const meshes = {};       // structure name -> array of meshes (for highlight)
const labels = {};       // structure name -> CSS2DObject
const labelVisible = true;

function makeMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.35,
    metalness: opts.metalness ?? 0.15,
    transparent: true,
    opacity: opts.opacity ?? 0.92,
    emissive: color,
    emissiveIntensity: opts.emissiveIntensity ?? 0.18,
  });
}

function register(name, mesh, group) {
  if (!groups[name]) { groups[name] = new THREE.Group(); scene.add(groups[name]); }
  if (!meshes[name]) meshes[name] = [];
  groups[name].add(mesh);
  meshes[name].push(mesh);
  mesh.userData.structure = name;
}

// --- Lungs (translucent shells) ---
function buildLung(side) {
  const g = new THREE.Group();
  const mat = makeMat(STRUCTURES[side].color, { opacity: 0.16, roughness: 0.5, emissiveIntensity: 0.05 });
  const geo = new THREE.SphereGeometry(1, 48, 32);
  const shell = new THREE.Mesh(geo, mat);
  shell.scale.set(1.15, 1.9, 0.85);
  shell.position.x = side === 'leftLung' ? -1.7 : 1.7;
  shell.position.y = 0.4;
  g.add(shell);
  // inner glow core
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 32, 24),
    makeMat(STRUCTURES[side].color, { opacity: 0.06, emissiveIntensity: 0.12 })
  );
  core.scale.copy(shell.scale);
  core.position.copy(shell.position);
  g.add(core);
  register(side, shell, g);
  register(side, core, g);
  return g;
}
buildLung('leftLung');
buildLung('rightLung');

// --- Airway tree (trachea -> bronchi -> bronchioles -> alveoli) ---
const airwayRoot = new THREE.Group();
scene.add(airwayRoot);

function tube(points, radius, color, name) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, 48, radius, 16, false);
  const mesh = new THREE.Mesh(geo, makeMat(color));
  register(name, mesh, airwayRoot);
  return mesh;
}

// Trachea
const tracheaPts = [
  new THREE.Vector3(0, 3.4, 0),
  new THREE.Vector3(0, 2.6, 0),
  new THREE.Vector3(0, 1.8, 0),
  new THREE.Vector3(0, 1.0, 0),
];
tube(tracheaPts, 0.34, STRUCTURES.trachea.color, 'trachea');

// Main bronchi (split at carina ~ y=1.0)
const carina = new THREE.Vector3(0, 1.0, 0);
const leftBronchiPts = [carina, new THREE.Vector3(-0.7, 0.55, 0), new THREE.Vector3(-1.5, 0.15, 0)];
const rightBronchiPts = [carina, new THREE.Vector3(0.7, 0.55, 0), new THREE.Vector3(1.5, 0.15, 0)];
tube(leftBronchiPts, 0.24, STRUCTURES.bronchi.color, 'bronchi');
tube(rightBronchiPts, 0.24, STRUCTURES.bronchi.color, 'bronchi');

// Bronchioles — recursive branching
const bronchioleEnds = [];
function branch(start, dir, radius, depth, maxDepth) {
  if (depth > maxDepth) { bronchioleEnds.push(start.clone()); return; }
  const len = 0.9 - depth * 0.12;
  const end = start.clone().add(dir.clone().multiplyScalar(len));
  const pts = [start.clone(), end.clone()];
  tube(pts, radius, STRUCTURES.bronchioles.color, 'bronchioles');
  const spread = 0.55;
  const d1 = dir.clone().normalize();
  const d2 = dir.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const perp = new THREE.Vector3().crossVectors(d1, up).normalize();
  d1.add(perp.clone().multiplyScalar(spread)).normalize();
  d2.add(perp.clone().multiplyScalar(-spread)).normalize();
  d1.y -= 0.25; d2.y -= 0.25;
  d1.normalize(); d2.normalize();
  branch(end, d1, radius * 0.7, depth + 1, maxDepth);
  branch(end, d2, radius * 0.7, depth + 1, maxDepth);
}
branch(new THREE.Vector3(-1.5, 0.15, 0), new THREE.Vector3(-0.6, -0.5, 0.2).normalize(), 0.16, 0, 2);
branch(new THREE.Vector3(1.5, 0.15, 0), new THREE.Vector3(0.6, -0.5, -0.2).normalize(), 0.16, 0, 2);

// Alveoli — clusters at bronchiole ends
const alveoliGroup = new THREE.Group();
scene.add(alveoliGroup);
const alveoliSpheres = [];
bronchioleEnds.forEach((end) => {
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.09 + Math.random() * 0.05, 12, 10),
      makeMat(STRUCTURES.alveoli.color, { emissiveIntensity: 0.35, roughness: 0.3 })
    );
    s.position.copy(end).add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.5
    ));
    alveoliGroup.add(s);
    alveoliSpheres.push(s);
    s.userData.structure = 'alveoli';
  }
});
meshes['alveoli'] = alveoliSpheres;
groups['alveoli'] = alveoliGroup;

// --- Labels ---
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
  else if (name === 'bronchi') p.set(0, 0.9, 0);
  else if (name === 'bronchioles') p.set(0, -0.6, 0);
  else if (name === 'alveoli') p.set(0, -1.6, 0);
  else if (name === 'leftLung') p.set(-1.7, 0.4, 0);
  else if (name === 'rightLung') p.set(1.7, 0.4, 0);
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
      m.material.opacity = Math.max(m.material.opacity, 0.95);
    } else {
      m.material.emissiveIntensity = originalEmissive[m.uuid] ?? 0.18;
    }
  });
}
function clearHighlights() {
  Object.keys(meshes).forEach((n) => highlight(n, false));
}

// ---------- Camera focus ----------
function focusOn(name, distance = 6) {
  const target = labelPos(name);
  const start = camera.position.clone();
  const end = target.clone().add(new THREE.Vector3(0, 0.5, distance));
  const startTarget = controls.target.clone();
  const t0 = performance.now();
  const dur = 900;
  function step(now) {
    const t = Math.min((now - t0) / dur, 1);
    const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOut
    camera.position.lerpVectors(start, end, e);
    controls.target.lerpVectors(startTarget, target, e);
    controls.update();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ---------- Airflow particles ----------
const particles = [];
const particleGroup = new THREE.Group();
scene.add(particleGroup);
const particleGeo = new THREE.SphereGeometry(0.05, 8, 8);
const particleMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.9 });

const airflowPath = [
  new THREE.Vector3(0, 3.4, 0),
  new THREE.Vector3(0, 2.6, 0),
  new THREE.Vector3(0, 1.8, 0),
  new THREE.Vector3(0, 1.0, 0),
  new THREE.Vector3(-0.7, 0.55, 0),
  new THREE.Vector3(-1.5, 0.15, 0),
  new THREE.Vector3(-1.8, -0.4, 0),
  new THREE.Vector3(-1.9, -1.2, 0),
  new THREE.Vector3(-1.9, -1.7, 0),
];
const airflowCurve = new THREE.CatmullRomCurve3(airflowPath);
let airflowActive = false;
let airflowTime = 0;

function spawnParticle() {
  const p = new THREE.Mesh(particleGeo, particleMat);
  p.userData.t = Math.random() * 0.15;
  p.userData.speed = 0.12 + Math.random() * 0.06;
  particleGroup.add(p);
  particles.push(p);
}
for (let i = 0; i < 40; i++) spawnParticle();

function updateAirflow(dt) {
  if (!airflowActive) { particleGroup.visible = false; return; }
  particleGroup.visible = true;
  particles.forEach((p) => {
    p.userData.t += p.userData.speed * dt;
    if (p.userData.t > 1) p.userData.t = 0;
    const pos = airflowCurve.getPointAt(p.userData.t);
    p.position.copy(pos);
    const scale = 0.6 + 0.8 * Math.sin(p.userData.t * Math.PI);
    p.scale.setScalar(scale);
  });
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
  if (/lung/.test(t)) return 'leftLung';
  if (/airflow|air travel|path air|how air|breathe|inhale/.test(t)) return 'airflow';
  if (/teach|lesson|tour|guide/.test(t)) return 'teach';
  return null;
}

const RESPONSES = {
  trachea: 'The trachea is the windpipe — a rigid, cartilage-reinforced tube that carries air from your throat down into the chest. I\'ve highlighted it and moved the camera in. It then splits into the two main bronchi at the carina.',
  bronchi: 'These are the main bronchi — the two large branches of the trachea, one to each lung. They conduct air deeper into the lungs and keep dividing into smaller bronchi. I\'ve highlighted them for you.',
  bronchioles: 'Bronchioles are the smallest conducting airways, under about 1 mm wide. They branch repeatedly and end in terminal bronchioles that deliver air to the alveoli. I\'ve highlighted the branching network.',
  alveoli: 'Alveoli are tiny air sacs — about 300 million per lung — wrapped in a dense web of capillaries. This is where gas exchange happens: oxygen diffuses into the blood and carbon dioxide diffuses out. I\'ve highlighted the alveolar clusters.',
  leftLung: 'The left lung has two lobes and is slightly smaller to make room for the heart. It receives air through the left main bronchus. I\'ve highlighted it.',
  rightLung: 'The right lung has three lobes and is larger than the left. It receives air through the right main bronchus. I\'ve highlighted it.',
};

async function handleUserInput(text) {
  addMessage('user', text);
  const intent = matchIntent(text);

  if (intent === 'airflow') {
    await runAgentSteps('bronchi', 'Air travels: trachea → main bronchi → bronchioles → alveoli. I\'ve started the airflow animation so you can watch the path air takes as you inhale.');
    startAirflow();
    return;
  }
  if (intent === 'teach') {
    startTeach();
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
  addMessage('agent', 'I can help you explore the respiratory system. Try asking me to "show me the bronchi", "explain the alveoli", "show me the path air takes", or press "Teach Me" for a guided tour.');
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

// ---------- Teach Me ----------
const LESSONS = [
  { name: 'trachea', title: '1. Trachea', text: 'Air enters through your nose or mouth and travels down the trachea (windpipe), a rigid tube kept open by rings of cartilage.' },
  { name: 'bronchi', title: '2. Bronchi', text: 'At the carina, the trachea splits into the left and right main bronchi — one for each lung. These keep dividing into smaller bronchi.' },
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
  stopTeach();
  clearHighlights();
  camera.position.set(0, 2, 16);
  controls.target.set(0, 0.5, 0);
  controls.update();
});

// ---------- Labels toggle ----------
let labelsOn = true;
document.getElementById('btn-labels').addEventListener('click', () => {
  labelsOn = !labelsOn;
  Object.values(labels).forEach((l) => (l.element.style.display = labelsOn ? '' : 'none'));
  document.getElementById('btn-labels').classList.toggle('active', !labelsOn);
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
  // gentle idle rotation of alveoli glow
  alveoliGroup.rotation.y += dt * 0.05;
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
addMessage('agent', 'Hi! I\'m Agent8088. I can see this 3D model of the respiratory system and control it for you.\n\nAsk me to "show me the bronchi", "explain the alveoli", or "show me the path air takes" — or press "Teach Me" for a guided tour.');
