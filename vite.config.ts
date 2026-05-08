import { defineConfig } from "vite";

// GitHub Pages serves the site at https://<user>.github.io/<repo>/, so the
// production base must be the repo path or asset URLs 404. Local dev stays at /.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/regal-walkthrough/" : "/",
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
  },
  server: {
    port: 5173,
    open: true,
  },
}));
