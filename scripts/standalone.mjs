import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

// Keep the normal Vite output and also offer a tiny, completely offline edition.
// The app has no network assets; inlining its compiled JS/CSS makes file:// work.
const output = resolve("dist");
let html = await readFile(resolve(output, "pacman.html"), "utf8");
const script = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/);
const style = html.match(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/);
if (!script || !style)
  throw new Error("Expected one Vite JavaScript entry and stylesheet.");
const asset = (path) => resolve(output, path.replace(/^\//, ""));
// The arcade has multiple Vite entries and shared chunks. Bundle this preserved
// classic separately so the offline HTML does not retain relative chunk imports.
const standalone = await build({
  entryPoints: ["src/main.ts"], bundle: true, write: false, outdir: "standalone",
  format: "iife", platform: "browser", target: "es2022", minify: true,
  define: { "import.meta.env.DEV": "false", "import.meta.env.PROD": "true" },
  legalComments: "none",
});
const js = standalone.outputFiles.find(file => file.path.endsWith(".js"))?.text;
const css = standalone.outputFiles.find(file => file.path.endsWith(".css"))?.text;
if (!js || !css) throw new Error("Expected bundled Pac-Man JavaScript and CSS.");
const icon = await readFile(resolve("public/favicon.svg"), "utf8");
html = html
  .replace(/<link\b[^>]*rel="modulepreload"[^>]*>/g, "")
  .replace(
    script[0],
    () =>
      `<script type="module">${js.replace(/<\/script/gi, "<\\/script")}</script>`,
  )
  .replace(style[0], () => `<style>${css}</style>`)
  .replace(
    'href="/favicon.svg"',
    `href="data:image/svg+xml,${encodeURIComponent(icon)}"`,
  );
await writeFile(resolve(output, "pacman.html"), html);
console.log(
  `Offline edition: dist/pacman.html (${Math.ceil(Buffer.byteLength(html) / 1024)} KiB)`,
);
