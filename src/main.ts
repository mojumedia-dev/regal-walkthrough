import * as pc from "playcanvas";
import { setupControls, isTouchDevice } from "./controls";

// Default splat: PlayCanvas's public guitar sample. Swap by setting VITE_SPLAT_URL
// at build time (Repo Settings → Variables → VITE_SPLAT_URL), or by dropping a file
// into public/splats/ and pointing the env var there (e.g. "/splats/regal-home.compressed.ply").
const DEFAULT_SPLAT_URL =
  "https://raw.githubusercontent.com/playcanvas/engine/main/examples/assets/splats/guitar/meta.json";
const SPLAT_URL = import.meta.env.VITE_SPLAT_URL ?? DEFAULT_SPLAT_URL;

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const loadingEl = document.getElementById("loading")!;
const statusEl = document.getElementById("status")!;
const fillEl = document.getElementById("loading-fill")!;
const hintEl = document.getElementById("hint")!;

const app = new pc.Application(canvas, {
  mouse: new pc.Mouse(canvas),
  touch: new pc.TouchDevice(canvas),
  keyboard: new pc.Keyboard(window),
  graphicsDeviceOptions: {
    antialias: false,
    preferWebGl2: true,
  },
});

// Gaussian Splat support is opt-in: pc.Application doesn't auto-register the
// system or resource handler, so we wire them by hand.
app.systems.add(new pc.GSplatComponentSystem(app));
app.loader.addHandler("gsplat", new pc.GSplatHandler(app));

app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);

app.scene.skyboxIntensity = 0.6;
app.scene.ambientLight.set(0.15, 0.15, 0.18);

const camera = new pc.Entity("camera");
camera.addComponent("camera", {
  clearColor: new pc.Color(0.02, 0.02, 0.03),
  fov: 60,
  nearClip: 0.05,
  farClip: 200,
});
camera.setLocalPosition(0, 1.6, 4);
app.root.addChild(camera);

setupControls(app, camera, canvas);

statusEl.textContent = "Loading walkthrough…";
hintEl.textContent = isTouchDevice() ? "Drag to look · pinch to zoom" : "Click to lock · WASD to move · drag to look";

const splatAsset = new pc.Asset("splat", "gsplat", { url: SPLAT_URL });
splatAsset.on("progress", (received: number, length: number) => {
  if (length > 0) {
    const pct = Math.min(100, Math.round((received / length) * 100));
    fillEl.style.width = `${pct}%`;
  }
});
splatAsset.on("error", (err: unknown) => {
  console.error("Failed to load splat:", err);
  statusEl.textContent = "Couldn't load this scene — check the splat URL in src/main.ts";
});
splatAsset.on("load", () => {
  const splat = new pc.Entity("splat");
  splat.addComponent("gsplat", { asset: splatAsset });
  app.root.addChild(splat);
  fillEl.style.width = "100%";
  requestAnimationFrame(() => loadingEl.classList.add("hidden"));
});
app.assets.add(splatAsset);
app.assets.load(splatAsset);

app.start();

window.addEventListener("resize", () => {
  app.resizeCanvas();
});
