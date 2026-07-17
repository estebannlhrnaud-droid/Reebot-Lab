import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

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

test("automatically falls back when the Ollama server is offline", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("offline-ai-test", `${process.pid}-${Date.now()}`);
  const childScript = `
    const { default: worker } = await import(${JSON.stringify(workerUrl.href)});
    const response = await worker.fetch(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "¿Cómo está mi CPU?", metrics: { cpu: 24 } }),
      }),
      { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} },
    );
    const payload = await response.json();
    process.stdout.write(JSON.stringify({ status: response.status, engine: payload.engine, reply: payload.reply }));
  `;
  const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", childScript], {
    env: { ...process.env, REEBOT_OLLAMA_URL: "http://127.0.0.1:1" },
    timeout: 15_000,
  });
  const result = JSON.parse(stdout);
  assert.equal(result.status, 200);
  assert.equal(result.engine, "basic");
  assert.match(result.reply, /procesador|CPU/i);
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
  assert.match(launcher, /Install-NodeJs/);
  assert.match(launcher, /OpenJS\.NodeJS\.LTS/);
  assert.match(launcher, /explorer\.exe/);
  assert.match(launcher, /CODIGO PARA VINCULAR/);
  assert.match(launcher, /ABRIR VERSION WEB/);
});

test("native Windows launcher can be compiled as the 0.3.0 executable", async () => {
  const source = await readFile(new URL("../launcher/ReebotLauncher.cs", import.meta.url), "utf8");
  const buildScript = await readFile(new URL("../build-launcher.ps1", import.meta.url), "utf8");
  assert.match(source, /AssemblyFileVersion\("0\.3\.0\.0"\)/);
  assert.match(source, /OpenJS\.NodeJS\.LTS/);
  assert.match(source, /EnvironmentVariableTarget\.Process/);
  assert.match(source, /npm ci/);
  assert.match(source, /vinext\.cmd/);
  assert.match(source, /reebot-launcher\.log/);
  assert.match(source, /EARLY ACCESS/);
  assert.match(source, /CONSOLA IA/);
  assert.match(source, /OPEN_REEBOT_AI\.cmd/);
  assert.match(source, /--self-test/);
  assert.match(buildScript, /target:winexe/);
  assert.match(buildScript, /reebot-mascot\.png/);
  const directConsole = await readFile(new URL("../OPEN_REEBOT_AI.cmd", import.meta.url), "utf8");
  assert.match(directConsole, /ollama\.exe" serve/);
  assert.match(directConsole, /analisis basico/);
});
