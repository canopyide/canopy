import { build, context } from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const isWatch = process.argv.includes("--watch");
const isProd = process.env.NODE_ENV === "production";

const external = [
  "electron",
  "node-pty", // Native module
  "esbuild", // Build tool
];

const common = {
  bundle: true,
  minify: isProd,
  sourcemap: !isProd,
  platform: "node",
  target: "node20", // Electron 33 uses Node 20
  external,
  logLevel: "info",
  absWorkingDir: root,
};

async function run() {
  console.log(`[Build] Starting build in ${isWatch ? "watch" : "single"} mode...`);

  // Config for ESM files (Main, Hosts)
  const esmConfig = {
    ...common,
    entryPoints: [
      "electron/main.ts",
      "electron/pty-host.ts",
      "electron/workspace-host.ts",
    ],
    outdir: "dist-electron/electron",
    format: "esm",
    splitting: true, // Share chunks between main/hosts
    chunkNames: "chunks/[name]-[hash]",
  };

  // Config for CJS file (Preload)
  const cjsConfig = {
    ...common,
    entryPoints: ["electron/preload.cts"],
    outdir: "dist-electron/electron",
    format: "cjs",
    outExtension: { ".js": ".cjs" },
  };

  try {
    if (isWatch) {
      const ctxEsm = await context(esmConfig);
      const ctxCjs = await context(cjsConfig);
      
      await Promise.all([ctxEsm.watch(), ctxCjs.watch()]);
      console.log("[Build] Watching for changes...");
    } else {
      await Promise.all([build(esmConfig), build(cjsConfig)]);
      console.log("[Build] Complete.");
    }
  } catch (error) {
    console.error("[Build] Failed:", error);
    process.exit(1);
  }
}

run();
