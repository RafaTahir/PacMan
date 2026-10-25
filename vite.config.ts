import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  server: { host: "0.0.0.0", proxy: { "/api": {
    target: "http://127.0.0.1:8787", changeOrigin: true,
    configure(proxy) {
      proxy.on("proxyReq", (proxyRequest, request) => {
        // This local development proxy is the browser's same-origin endpoint.
        // Rewrite only a matching Vite origin to the local Worker origin;
        // external origins and sec-fetch-site remain rejected by the Worker.
        const origin = request.headers.origin, host = request.headers.host;
        if (origin && host) {
          try { if (new URL(origin).host === host) proxyRequest.setHeader("origin", "http://127.0.0.1:8787"); }
          catch { /* Invalid origins pass unchanged to server validation. */ }
        }
      });
    },
  } } },
  build: {
    rollupOptions: {
      input: { arcade: resolve("index.html"), pacman: resolve("pacman.html") },
      output: { manualChunks: { three: ["three"] } },
    },
  },
});
