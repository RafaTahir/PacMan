import { describe, expect, it } from "vitest";
import { createEmbeddedAssets, type EmbeddedManifest } from "../server/embedded-assets";

const html = "<!doctype html><title>Arcade</title>";
const file = (text: string, contentType = "text/plain; charset=utf-8") => ({
  base64: Buffer.from(text).toString("base64"), bytes: Buffer.byteLength(text), contentType,
  etag: '"fixture-sha"', cacheControl: "public, max-age=0, must-revalidate",
});
const manifest: EmbeddedManifest = {
  "/index.html": file(html, "text/html; charset=utf-8"),
  "/pacman.html": file("classic", "text/html; charset=utf-8"),
  "/assets/game-Abcdef12.js": { ...file("export default 42;", "text/javascript; charset=utf-8"), cacheControl: "public, max-age=31536000, immutable" },
  "/poster space.svg": file("<svg>✓</svg>", "image/svg+xml"),
};
const assets = createEmbeddedAssets(manifest);
const get = (path: string, init?: RequestInit) => assets.fetch(new Request(`https://arcade.example${path}`, init));
describe("standalone Sites assets binding", () => {
  it("serves root, SPA navigation, query strings and the distinct classic page", async () => {
    for (const path of ["/", "/index.html?cache=1", "/cabinet/neon-rally", "/cabinet/neon-rally/"])
      expect(await (await get(path)).text()).toBe(html);
    expect(await (await get("/pacman.html")).text()).toBe("classic");
  });
  it("preserves MIME, byte length, ETag and immutable cache headers", async () => {
    const reply = await get("/assets/game-Abcdef12.js");
    expect(reply.status).toBe(200);
    expect(reply.headers.get("content-type")).toContain("text/javascript");
    expect(reply.headers.get("content-length")).toBe("18");
    expect(reply.headers.get("cache-control")).toContain("immutable");
    expect(reply.headers.get("etag")).toBe('"fixture-sha"');
    expect(await reply.text()).toBe("export default 42;");
  });
  it("HEAD returns the same representation headers and no body", async () => {
    const reply = await get("/", { method: "HEAD" });
    expect(reply.status).toBe(200); expect(await reply.text()).toBe("");
    expect(reply.headers.get("content-length")).toBe(String(Buffer.byteLength(html)));
  });
  it("supports strong, weak and wildcard conditional GET/HEAD", async () => {
    for (const value of ['"fixture-sha"', 'W/"fixture-sha"', '"other", "fixture-sha"', "*"])
      for (const method of ["GET", "HEAD"]) {
        const reply = await get("/", { method, headers: { "If-None-Match": value } });
        expect(reply.status).toBe(304); expect(await reply.text()).toBe("");
      }
  });
  it("keeps missing files/API paths as 404 instead of HTML", async () => {
    for (const path of ["/missing.js", "/assets/missing.css", "/api", "/api/no-such-route"])
      expect((await get(path)).status).toBe(404);
  });
  it("rejects mutation methods with an explicit Allow header", async () => {
    const reply = await get("/", { method: "POST" });
    expect(reply.status).toBe(405); expect(reply.headers.get("allow")).toBe("GET, HEAD");
  });
  it("decodes encoded asset names while preserving UTF-8 bytes", async () => {
    const reply = await get("/poster%20space.svg");
    expect(reply.headers.get("content-type")).toBe("image/svg+xml");
    expect(await reply.text()).toBe("<svg>✓</svg>");
  });
  it("rejects malformed and traversal-like encoded paths", async () => {
    for (const path of ["/%GG", "/%00", "/%5Csecret", "/..%2Fsecret"])
      expect((await get(path)).status).toBe(400);
  });
  it("serves bounded byte ranges including suffixes", async () => {
    const reply = await get("/pacman.html", { headers: { Range: "bytes=1-3" } });
    expect(reply.status).toBe(206); expect(reply.headers.get("content-range")).toBe("bytes 1-3/7");
    expect(reply.headers.get("content-length")).toBe("3"); expect(await reply.text()).toBe("las");
    expect(await (await get("/pacman.html", { headers: { Range: "bytes=-2" } })).text()).toBe("ic");
  });
  it("rejects invalid ranges and respects If-Range/HEAD semantics", async () => {
    for (const range of ["bytes=20-30", "bytes=3-1", "bytes=-0", "bytes=", "bytes=0-1,3-4"])
      expect((await get("/pacman.html", { headers: { Range: range } })).status).toBe(416);
    expect((await get("/pacman.html", { headers: { Range: "bytes=0-1", "If-Range": '"stale"' } })).status).toBe(200);
    expect((await get("/pacman.html", { method: "HEAD", headers: { Range: "bytes=0-1" } })).status).toBe(200);
  });
});
