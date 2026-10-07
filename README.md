# 🫁 Talk to Your CT Scan — Powered by Agent8088

An interactive, educational demo showing how **Agent8088** can give an AI agent
**vision + tools + reasoning + interactive control** over a 3D anatomical model
of the respiratory system.

> ⚠️ **Educational demo only — this is NOT a medical diagnostic tool.**

## What it does

- **Interactive 3D visualization** of the trachea, main bronchi, bronchioles,
  alveoli, and left/right lungs (rotate, zoom, pan, reset, select structures,
  show/hide labels).
- **Anatomically connected airway tree** — trachea → main bronchi → lobar
  bronchi (3 right / 2 left) → segmental bronchi → bronchioles → alveolar
  ducts → alveoli, all physically joined as one coherent system.
- **Realistic lungs** — tapered apex, widened base, flattened medial surface,
  cardiac notch on the left lung, and subtle lobe fissures.
- **Anchored alveoli** — alveolar clusters attached to terminal bronchioles via
  alveolar ducts (no floating/independent movement).
- **Lung Layer toggle** — fade the lung tissue on/off to expose the internal
  airway tree, with a smooth transparency animation.
- **View switcher** — OUTSIDE / AIRWAYS / ALVEOLI quick buttons with smooth
  camera transitions; lung tissue auto-fades as you zoom in.
- **Agent8088 chat panel** — ask questions in plain English and the agent both
  *answers* and *controls the 3D model* (highlights structures, moves the camera,
  toggles the lung layer, navigates inside).
- **Agent Activity panel** — a live step-by-step trace of the agent's reasoning
  (understand → identify → retrieve → visualize → update → verify).
- **Show Airflow** — animated particles that follow the *actual* bronchial
  pathways (trachea → bronchi → bronchioles → alveoli), not a random path.
- **Breathe** — a breathing simulation: lungs expand and the diaphragm descends
  on inhalation, then contract and rise on exhalation, with airflow direction
  reversing to match the breath cycle.
- **Diaphragm** — a dome-shaped muscle below the lungs that animates with the
  breathing cycle.
- **Teach Me** — a guided, step-by-step tour of the respiratory system with
  automatic camera/highlight changes.
- Futuristic dark UI with glassmorphism and cyan/blue glow.

## Try it

- **Live site:** https://rahimahgilani.github.io/talk-to-your-ct-scan/
- **Repository:** https://github.com/rahimahgilani/talk-to-your-ct-scan

## Run locally

```bash
# any static server works
npx serve .
# or
python -m http.server 8000
```

Then open http://localhost:8000

## Tech

- Plain HTML/CSS/JS (no build step)
- [Three.js](https://threejs.org/) (WebGL) for the 3D scene
- OrbitControls, UnrealBloomPass, CSS2DRenderer
- Deployed on GitHub Pages

## About the CT data

The prompt asked for a complete chest CT series from
[LIDC-IDRI (The Cancer Imaging Archive)](https://www.cancerimagingarchive.net/collection/lidc-idri/).
Downloading a full LIDC-IDRI series requires the NBIA Data Retriever and
hundreds of MB of DICOM per series, which is impractical in this environment.
Per the prompt's fallback, this demo instead uses a **procedurally generated,
anatomically-plausible 3D model** of the airway tree and lungs so the
interaction is fully functional and self-contained. The model is stylized and
is not derived from real patient imaging.

## API keys / environment variables

**None required.** The app is fully static and runs entirely in the browser.

## Known limitations

- The 3D anatomy is a stylized procedural model, not real DICOM-derived
  segmentation (see above).
- The "agent" is a rule-based intent matcher (keyword matching), not a live
  connection to a hosted Agent8088 LLM runtime — it demonstrates the
  *interaction pattern* (understand → act → verify) locally.
- Bronchioles are generated to a limited depth (3 generations) for
  performance and clarity.
- No mobile-specific layout tuning beyond a basic responsive breakpoint.
