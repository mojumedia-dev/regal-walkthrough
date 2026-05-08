import * as pc from "playcanvas";
import { setupControls, isTouchDevice } from "./controls";

// Default splat: PlayCanvas's public guitar sample. Swap by setting VITE_SPLAT_URL
// at build time (Repo Settings → Variables → VITE_SPLAT_URL), or by dropping a file
// into public/splats/ and pointing the env var there (e.g. "/splats/regal-home.compressed.ply").
const DEFAULT_SPLAT_URL =
  "https://raw.githubusercontent.com/playcanvas/engine/main/examples/assets/splats/guitar.compressed.ply";
// Use ||, NOT ??, so an empty-string env var (e.g. CI passing through an
// unset variable) still falls back to the default. With ?? we shipped an
// empty URL to production and the gsplat handler crashed on `url.original`.
const SPLAT_URL = import.meta.env.VITE_SPLAT_URL || DEFAULT_SPLAT_URL;

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const loadingEl = document.getElementById("loading")!;
const statusEl = document.getElementById("status")!;
const fillEl = document.getElementById("loading-fill")!;
const hintEl = document.getElementById("hint")!;

async function bootstrap() {
  // Modern PlayCanvas init: AppBase + AppOptions, mirroring engine/examples
  // gaussian-splatting/simple.example.mjs. pc.Application doesn't wire up the
  // gsplat handler the way these examples do, hence the earlier "Cannot read
  // properties of null (reading 'original')" — the loader was missing.
  const device = await pc.createGraphicsDevice(canvas, {
    antialias: false,
    deviceTypes: [pc.DEVICETYPE_WEBGL2],
  });
  device.maxPixelRatio = Math.min(window.devicePixelRatio, 2);

  const opts = new pc.AppOptions();
  opts.graphicsDevice = device;
  opts.mouse = new pc.Mouse(canvas);
  opts.touch = new pc.TouchDevice(canvas);
  opts.keyboard = new pc.Keyboard(window);
  opts.componentSystems = [
    pc.RenderComponentSystem,
    pc.CameraComponentSystem,
    pc.LightComponentSystem,
    pc.GSplatComponentSystem,
  ];
  opts.resourceHandlers = [pc.GSplatHandler, pc.TextureHandler, pc.ContainerHandler];

  const app = new pc.AppBase(canvas);
  app.init(opts);
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
    toneMapping: pc.TONEMAP_ACES,
  });
  camera.setLocalPosition(0, 1.6, 4);
  app.root.addChild(camera);

  setupControls(app, camera, canvas);

  statusEl.textContent = "Loading walkthrough…";
  hintEl.textContent = isTouchDevice()
    ? "Drag to look · pinch to zoom"
    : "Click to lock · WASD to move · drag to look";

  const splatAsset = new pc.Asset("splat", "gsplat", { url: SPLAT_URL });
  splatAsset.on("progress", (received: number, length: number) => {
    if (length > 0) {
      const pct = Math.min(100, Math.round((received / length) * 100));
      fillEl.style.width = `${pct}%`;
    }
  });

  const loader = new pc.AssetListLoader([splatAsset], app.assets);
  loader.load((err: string | null) => {
    if (err) {
      console.error("Splat load failed:", err);
      statusEl.textContent = "Couldn't load this scene — check the splat URL in src/main.ts";
      return;
    }
    const splat = new pc.Entity("splat");
    splat.addComponent("gsplat", { asset: splatAsset, unified: true });
    app.root.addChild(splat);
    fillEl.style.width = "100%";
    requestAnimationFrame(() => loadingEl.classList.add("hidden"));
    app.start();
  });

  window.addEventListener("resize", () => app.resizeCanvas());
}

bootstrap().catch((err) => {
  console.error(err);
  statusEl.textContent = "Boot error — see browser console";
});
