import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders REEBOT LAB", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>REEBOT LAB/i);
  assert.match(html, /REEBOT/);
  assert.match(html, /LAB/);
  assert.match(html, /SYS\/CPU-01/);
  assert.match(html, /SEÑALES RELEVANTES/);
  assert.match(html, /Interactuar con REE/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("local basic AI answers without a model", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("ai-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "¿Cómo está mi RAM?",
        mode: "basic",
        metrics: { memory: 91, cpu: 20, disk: 12, processes: [{ name: "juego.exe", pid: 10, cpu: 2, ram: 3200 }] },
      }),
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.engine, "basic");
  assert.match(payload.reply, /RAM|memoria/i);
});

test("local bridge requires pairing and restricts browser origins", async () => {
  const bridge = await readFile(new URL("../telemetry-server.ps1", import.meta.url), "utf8");
  assert.match(bridge, /\/bridge\/status/);
  assert.match(bridge, /\/pair-code/);
  assert.match(bridge, /Bearer \$script:bridgeToken/);
  assert.match(bridge, /Access-Control-Allow-Private-Network/);
  assert.doesNotMatch(bridge, /Access-Control-Allow-Origin'\s*,\s*'\*'/);
});

test("profiles expose Studio and distinct UI themes", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /Studio:.*editar video, imagen y audio/s);
  for (const profile of ["gaming", "studio", "chill", "movie"]) {
    assert.match(styles, new RegExp(`data-profile=["']${profile}["']`));
  }
});

test("Windows launcher checks prerequisites and starts each local service", async () => {
  const launcher = await readFile(new URL("../reebot-launcher.ps1", import.meta.url), "utf8");
  const entrypoint = await readFile(new URL("../REEBOT_LAB_LAUNCHER.cmd", import.meta.url), "utf8");
  assert.match(entrypoint, /reebot-launcher\.ps1/i);
  assert.match(launcher, /Confirm-Dependencies/);
  assert.match(launcher, /Start-BridgeIfNeeded/);
  assert.match(launcher, /Start-OllamaIfAvailable/);
  assert.match(launcher, /CODIGO PARA VINCULAR/);
  assert.match(launcher, /ABRIR VERSION WEB/);
});
