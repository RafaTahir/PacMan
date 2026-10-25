import { build } from "esbuild";
import { copyFile } from "node:fs/promises";
await build({ entryPoints: ["server/index.ts"], outfile: "build/worker.mjs", bundle: true,
  format: "esm", platform: "browser", target: "es2022", minify: true,
  sourcemap: false, legalComments: "none" });
console.log("Portable Worker ESM: build/worker.mjs (D1 binding DB; assets binding ASSETS)");
await copyFile("THIRD_PARTY_NOTICES.md", "dist/THIRD_PARTY_NOTICES.txt");
