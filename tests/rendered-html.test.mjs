import assert from "node:assert/strict";
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
