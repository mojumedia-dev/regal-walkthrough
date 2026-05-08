# Regal Walkthrough

3D Gaussian Splatting walkthrough for Regal Homes — built on PlayCanvas, deployed to GitHub Pages.

## How it works

Visitor opens the URL in a browser → splat scene loads → they walk through the home with WASD/mouse on desktop or drag/pinch on mobile. No app, no install, no agent.

## Stack

- **PlayCanvas** engine (npm) — native Gaussian Splat rendering
- **Vite + TypeScript** — dev server, build, type safety
- **GitHub Pages** — static deploy on every push to `main`

## Local dev

```bash
npm install
npm run dev
```

Opens http://localhost:5173 with the default sample splat.

## Adding your own home

1. Capture the home (Polycam, Postshot, or similar) → export `.compressed.ply`
2. Drop the file into `public/splats/`
3. One of:
   - Edit `DEFAULT_SPLAT_URL` in `src/main.ts` to `/splats/your-file.compressed.ply`
   - Or set `VITE_SPLAT_URL` as a GitHub Actions Variable (Settings → Secrets and variables → Actions → Variables)
4. Push — GitHub Pages rebuilds in ~30 sec

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and publishes to GitHub Pages. Site lives at `https://mojumedia-dev.github.io/regal-walkthrough/`.

First-time setup: Repo Settings → Pages → Source: "GitHub Actions".

## Capture tips (Gaussian Splatting)

- **Lighting:** consistent — avoid mid-capture sun shifts, close blinds for indoor scans
- **Movement:** slow circles in each room, eye-level + low + high angles
- **Coverage:** 60-80% overlap between consecutive frames, walk every wall
- **Avoid:** large mirrors and glass (artifacts), thin objects (fans, wires), people moving in shot
- **Phone:** iPhone 12+ or Pixel 6+ with LiDAR works well; older phones need more photos
- **Tools:**
  - Polycam (paid, easiest, in-app processing)
  - Postshot (Mac/Windows desktop, free trial, higher quality)
  - Open-source: gsplat or the Inria reference implementation (more setup, free)
