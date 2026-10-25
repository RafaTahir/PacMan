export interface EmbeddedAsset {
  base64: string;
  contentType: string;
  bytes: number;
  etag: string;
  cacheControl: string;
}
export type EmbeddedManifest = Record<string, EmbeddedAsset>;

/** A bounded static binding for a standalone Worker, with no filesystem at runtime. */
export function createEmbeddedAssets(manifest: EmbeddedManifest) {
  const decoded = new Map<string, Uint8Array<ArrayBuffer>>();
  const text = (message: string, status: number, head: boolean, extra: Record<string, string> = {}) =>
    new Response(head ? null : message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", ...extra } });
  return {
    async fetch(request: Request): Promise<Response> {
      const head = request.method === "HEAD";
      if (!head && request.method !== "GET") return text("Method not allowed.", 405, false, { Allow: "GET, HEAD" });
      let path: string;
      try { path = decodeURIComponent(new URL(request.url).pathname); }
      catch { return text("Invalid asset path.", 400, head); }
      if (/[\\\u0000-\u001f]/.test(path) || path.split("/").some(part => part === "." || part === ".."))
        return text("Invalid asset path.", 400, head);
      // Never turn an API typo into an HTML SPA response.
      if (path === "/api" || path.startsWith("/api/")) return text("Not found.", 404, head);
      let key = path;
      let asset = manifest[key];
      if (!asset) {
        key = `${path.replace(/\/$/, "")}/index.html`;
        asset = manifest[key];
      }
      if (!asset && !path.replace(/\/$/, "").split("/").at(-1)!.includes(".")) {
        key = "/index.html";
        asset = manifest[key];
      }
      if (!asset) return text("Not found.", 404, head);
      const headers = new Headers({
        "Content-Type": asset.contentType, "Content-Length": String(asset.bytes),
        "Cache-Control": asset.cacheControl, ETag: asset.etag,
        "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff",
      });
      const matches = request.headers.get("If-None-Match")?.split(",").some(value => {
        const tag = value.trim().replace(/^W\//, "");
        return tag === "*" || tag === asset.etag;
      });
      if (matches) { headers.delete("Content-Length"); return new Response(null, { status: 304, headers }); }
      if (head) return new Response(null, { status: 200, headers });
      let bytes = decoded.get(key);
      if (!bytes) {
        const raw = atob(asset.base64);
        bytes = new Uint8Array(raw.length);
        for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
        decoded.set(key, bytes);
      }
      const range = request.headers.get("Range");
      const ifRange = request.headers.get("If-Range");
      if (range && (!ifRange || ifRange === asset.etag)) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        let start = 0, end = bytes.length - 1;
        if (match && (match[1] || match[2])) {
          if (match[1]) { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
          else start = Math.max(0, bytes.length - Number(match[2]));
        }
        if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= bytes.length || (match[1] === "" && Number(match[2]) === 0)) {
          headers.set("Content-Range", `bytes */${bytes.length}`); headers.set("Content-Length", "0");
          return new Response(null, { status: 416, headers });
        }
        const part = bytes.slice(start, end + 1);
        headers.set("Content-Range", `bytes ${start}-${end}/${bytes.length}`); headers.set("Content-Length", String(part.byteLength));
        return new Response(part, { status: 206, headers });
      }
      return new Response(bytes, { status: 200, headers });
    },
  };
}
