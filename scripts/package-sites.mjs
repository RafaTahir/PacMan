import { readFile, readdir, mkdir, writeFile, cp, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative, extname, sep } from "node:path";
import { build } from "esbuild";

const root = process.cwd(), directory = resolve(root, "dist");
const mime = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".otf": "font/otf", ".wasm": "application/wasm", ".xml": "application/xml", ".pdf": "application/pdf",
};
const assets = {}, inventory = {};
async function collect(folder) {
  for (const item of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(folder, item.name);
    if (item.isSymbolicLink()) throw new Error(`Refusing symlink in static assets: ${item.name}`);
    if (item.isDirectory()) { await collect(path); continue; }
    if (!item.isFile()) continue;
    const key = "/" + relative(directory, path).split(sep).join("/");
    const bytes = await readFile(path), hash = createHash("sha256").update(bytes).digest("hex");
    const metadata = { contentType: mime[extname(path).toLowerCase()] ?? "application/octet-stream", bytes: bytes.length,
      etag: `"${hash}"`, cacheControl: /^\/assets\/[^/]+-[\w-]{8,}\.[^/]+$/.test(key) ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate" };
    assets[key] = { ...metadata, base64: bytes.toString("base64") };
    inventory[key] = { ...metadata, sha256: hash };
  }
}
await collect(directory);
if (!assets["/index.html"] || !assets["/pacman.html"]) throw new Error("Build both arcade and preserved Pac-Man pages before packaging Sites.");
await readFile(resolve(root, "build/worker.mjs"));
await mkdir(resolve(root, "dist-sites/server"), { recursive: true });
await build({
  stdin: { contents: `import app from './build/worker.mjs';
import { createEmbeddedAssets } from './server/embedded-assets.ts';
import manifest from 'arcade:embedded-assets';
const ASSETS = createEmbeddedAssets(manifest);
export default { fetch(request, env, context) { return app.fetch(request, { ...env, ASSETS }, context); } };`,
    sourcefile: "sites-entry.js", resolveDir: root, loader: "js" },
  plugins: [{ name: "embedded-static-assets", setup(builder) {
    builder.onResolve({ filter: /^arcade:embedded-assets$/ }, () => ({ path: "manifest", namespace: "arcade-assets" }));
    builder.onLoad({ filter: /.*/, namespace: "arcade-assets" }, () => ({ contents: `export default ${JSON.stringify(assets)};`, loader: "js" }));
  } }],
  outfile: resolve(root, "dist-sites/server/index.js"), bundle: true, format: "esm", platform: "browser",
  target: "es2022", minify: true, sourcemap: false, legalComments: "none",
});
await writeFile(resolve(root, "dist-sites/asset-manifest.json"), JSON.stringify(inventory, null, 2) + "\n");
await cp(resolve(root, "drizzle"), resolve(root, "dist-sites/drizzle"), { recursive: true });
await mkdir(resolve(root, "dist-sites/.openai"), { recursive: true });
await copyFile(resolve(root, ".openai/hosting.json"), resolve(root, "dist-sites/.openai/hosting.json"));
const worker = await readFile(resolve(root, "dist-sites/server/index.js"));
console.log(JSON.stringify({ output: "dist-sites/server/index.js", files: Object.keys(assets).length,
  embeddedBytes: Object.values(assets).reduce((sum, item) => sum + item.bytes, 0),
  workerBytes: worker.length, workerSha256: createHash("sha256").update(worker).digest("hex"), externalAssetBinding: false }));
