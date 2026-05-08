// Headless browser verification: build, serve via vite preview, navigate
// with system Chrome via puppeteer-core, and report any console errors or
// page errors. Exits non-zero on failure so we never push a broken build.
//
// Usage: node _verify.cjs

const { spawn } = require("node:child_process");
const path = require("node:path");
const puppeteer = require("puppeteer-core");

const CHROME = process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 4400 + Math.floor(Math.random() * 100);
const URL = `http://localhost:${PORT}/regal-walkthrough/`;
const WAIT_MS = 12000; // generous: splat must download + parse + first frame

async function startPreview() {
  const proc = spawn(
    "npx",
    ["vite", "preview", "--port", String(PORT), "--strictPort", "--base", "/regal-walkthrough/"],
    { cwd: path.dirname(__filename), shell: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  proc.stdout.on("data", (b) => process.stdout.write("[vite] " + b.toString()));
  proc.stderr.on("data", (b) => process.stderr.write("[vite] " + b.toString()));
  // Poll the port for readiness
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(URL);
      if (res.ok || res.status === 304) return proc;
    } catch {}
  }
  proc.kill();
  throw new Error("preview never came up after 20s");
}

(async () => {
  console.log("[verify] starting vite preview...");
  const preview = await startPreview();
  console.log("[verify] preview up at", URL);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"],
  });

  const errors = [];
  const consoles = [];
  const page = await browser.newPage();
  // Filter out two unavoidable noise sources in headless: favicon 404s
  // (we don't ship one) and the WebGL CONTEXT_LOST that SwiftShader hits
  // under heavy splat loads. Anything else surfaces as a real failure.
  const isNoise = (txt) =>
    /favicon/i.test(txt) ||
    /CONTEXT_LOST_WEBGL/.test(txt) ||
    /Failed to load resource: the server responded with a status of 404 \(Not Found\)/.test(txt);

  page.on("console", (msg) => {
    const txt = `[${msg.type()}] ${msg.text()}`;
    consoles.push(txt);
    if (msg.type() === "error" && !isNoise(txt)) errors.push(txt);
  });
  page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));
  page.on("requestfailed", (req) => {
    const url = req.url();
    if (!isNoise(url)) {
      errors.push(`[requestfailed] ${url} — ${req.failure()?.errorText}`);
    }
  });

  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 15000 });
    await new Promise((r) => setTimeout(r, WAIT_MS));

    // Did the loading overlay disappear (success signal)?
    const stillLoading = await page.evaluate(() => {
      const el = document.getElementById("loading");
      return el && !el.classList.contains("hidden");
    });

    console.log("\n=== Console output ===");
    consoles.forEach((l) => console.log("  " + l));
    console.log("\n=== Errors ===");
    if (errors.length === 0) console.log("  (none)");
    else errors.forEach((e) => console.log("  " + e));
    console.log("\nLoading overlay still visible:", stillLoading);

    if (errors.length > 0 || stillLoading) {
      process.exitCode = 1;
    } else {
      console.log("\n[verify] PASS — splat rendered, no console errors.");
    }
  } finally {
    await browser.close();
    preview.kill();
  }
})().catch((e) => {
  console.error("[verify] crashed:", e);
  process.exit(2);
});
