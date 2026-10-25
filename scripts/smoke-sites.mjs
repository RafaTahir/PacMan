import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";

const module = await import(pathToFileURL(resolve("dist-sites/server/index.js")).href);
assert.deepEqual(Object.keys(module), ["default"], "Worker exports only its fetch entrypoint");
const worker = module.default;
const inventory = JSON.parse(await readFile("dist-sites/asset-manifest.json", "utf8"));
const request = (path, init, env = {}) => worker.fetch(new Request(`https://arcade.example${path}`, init), env, { waitUntil() {} });
let checkedAssets = 0;
for (const [path, metadata] of Object.entries(inventory)) {
  const response = await request(path);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), metadata.contentType);
  assert.equal(response.headers.get("etag"), metadata.etag);
  const body = new Uint8Array(await response.arrayBuffer());
  assert.equal(body.byteLength, metadata.bytes);
  assert.equal(createHash("sha256").update(body).digest("hex"), metadata.sha256);
  const head = await request(path, { method: "HEAD" });
  assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal(head.headers.get("content-length"), String(metadata.bytes));
  checkedAssets++;
}
const home = await readFile("dist/index.html", "utf8");
assert.equal(await (await request("/")).text(), home);
assert.equal(await (await request("/cabinet/neon-rally?from=home")).text(), home);
assert.equal((await request("/missing-module.js")).status, 404);
const conditional = await request("/", { headers: { "If-None-Match": inventory["/index.html"].etag } });
assert.equal(conditional.status, 304); assert.equal(await conditional.text(), "");
const missingDB = await request("/api/health");
assert.equal(missingDB.status, 503); assert.equal((await missingDB.json()).database, "unconfigured");
assert.equal(missingDB.headers.get("cache-control"), "no-store");
let dbReads = 0;
const DB = { prepare(sql) {
  assert.equal(this, DB, "real binding reference and method receiver are preserved");
  assert.match(sql, /^SELECT /);
  return { async all() { dbReads++; return { success: true, results: [], meta: {} }; } };
} };
const env = { DB, RATE_LIMIT_SECRET: "test-only-salt", OTHER_BINDING: { fixture: true } };
const bound = await request("/api/health", undefined, env);
assert.equal(bound.status, 200); assert.equal((await bound.json()).ok, true); assert.equal(dbReads, 1);
assert.equal(env.ASSETS, undefined, "adapter does not mutate platform bindings");
const api404 = await request("/api/not-a-route", undefined, env);
assert.equal(api404.status, 404); assert.equal((await api404.json()).error.code, "not_found");
assert.equal(api404.headers.get("content-type"), "application/json; charset=utf-8");
assert.equal(api404.headers.get("cache-control"), "no-store");
async function sameTree(folder) {
  for (const item of await readdir(folder, { withFileTypes: true })) {
    const source = resolve(folder, item.name);
    if (item.isDirectory()) { await sameTree(source); continue; }
    const destination = resolve("dist-sites/drizzle", relative("drizzle", source));
    assert.deepEqual(await readFile(destination), await readFile(source), "migration SQL and metadata bytes preserved");
  }
}
await sameTree("drizzle");
const hosting = JSON.parse(await readFile("dist-sites/.openai/hosting.json", "utf8"));
assert.equal(hosting.project_id, "appgprj_6add9f91d5088191b2397efdda9c3663");
assert.equal(hosting.d1, "DB"); assert.equal(hosting.r2, null); assert.equal(hosting.static_dir, undefined);
console.log(JSON.stringify({ packagedWorker: "passed", assetsGETAndHEAD: checkedAssets, spaAnd404: "passed", conditionalGET: "passed",
  apiStatusHeadersAndDBForwarding: "passed (binding stub; existing real D1 integration unchanged)", migrationsAndHosting: "byte-preserved" }));
