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
  assert.match(html, /Interactuar con REEBI/);
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
  assert.match(launcher, /Open-DesktopApp/);
  assert.match(launcher, /REEBOT LAB Desktop\.exe/);
  assert.match(launcher, /CODIGO PARA VINCULAR/);
  assert.match(launcher, /ABRIR VERSION WEB/);
});

test("native Windows launcher can be compiled as the 0.6.0 executable", async () => {
  const source = await readFile(new URL("../launcher/ReebotLauncher.cs", import.meta.url), "utf8");
  const buildScript = await readFile(new URL("../build-launcher.ps1", import.meta.url), "utf8");
  assert.match(source, /AssemblyFileVersion\("0\.6\.0\.0"\)/);
  assert.match(source, /OpenJS\.NodeJS\.LTS/);
  assert.match(source, /EnvironmentVariableTarget\.Process/);
  assert.match(source, /npm ci/);
  assert.match(source, /vinext\.cmd/);
  assert.match(source, /reebot-launcher\.log/);
  assert.match(source, /EARLY ACCESS/);
  assert.match(source, /CONSOLA IA/);
  assert.match(source, /OPEN_REEBOT_AI\.cmd/);
  assert.match(source, /install-reebot\.ps1/);
  assert.match(source, /Environment\.SpecialFolder\.ProgramFiles/);
  assert.match(source, /Environment\.SpecialFolder\.LocalApplicationData/);
  assert.match(source, /info\.Verb = "runas"/);
  assert.match(source, /--self-test/);
  assert.match(source, /REEBOT LAB Updater\.exe/);
  assert.match(source, /--check-silent/);
  assert.match(buildScript, /target:winexe/);
  assert.match(buildScript, /reebot-mascot\.png/);
  assert.match(buildScript, /Microsoft\.Web\.WebView2/);
  const directConsole = await readFile(new URL("../OPEN_REEBOT_AI.cmd", import.meta.url), "utf8");
  assert.match(directConsole, /ollama\.exe" serve/);
  assert.match(directConsole, /analisis basico/);
});

test("desktop host keeps the UI inside a secured local app window", async () => {
  const desktop = await readFile(new URL("../launcher/ReebotDesktop.cs", import.meta.url), "utf8");
  const ai = await readFile(new URL("../app/lib/local-ai.ts", import.meta.url), "utf8");
  assert.match(desktop, /AssemblyFileVersion\("0\.6\.0\.0"\)/);
  assert.match(desktop, /Microsoft\.Web\.WebView2/);
  assert.match(desktop, /http:\/\/localhost:3000/);
  assert.match(desktop, /target\.IsLoopback && target\.Port == 3000/);
  assert.match(desktop, /WebView2RuntimeNotFoundException/);
  assert.match(desktop, /AreDefaultContextMenusEnabled = false/);
  assert.match(ai, /Eres REEBI/);
});

test("first run installs REEBOT LAB outside Downloads", async () => {
  const installer = await readFile(new URL("../install-reebot.ps1", import.meta.url), "utf8");
  assert.match(installer, /\$env:ProgramFiles/);
  assert.match(installer, /app-\$Version/);
  assert.match(installer, /CommonDesktopDirectory/);
  assert.match(installer, /Start Menu\\Programs\\REEBOT LAB/);
  assert.match(installer, /Copy-Item/);
  assert.match(installer, /REEBOT LAB Updater\.exe/);
  assert.doesNotMatch(installer, /Remove-Item/);
});

test("performance telemetry refreshes every second and combines GPU with VRAM", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const bridge = await readFile(new URL("../telemetry-server.ps1", import.meta.url), "utf8");
  const references = JSON.parse(await readFile(new URL("../hardware-references.json", import.meta.url), "utf8"));
  assert.match(page, /setInterval\(poll, 1000\)/);
  assert.match(page, /BASE<\/span><span>BOOST<\/span><span>XOC/);
  assert.match(page, /Historial de GPU y VRAM/);
  assert.match(page, /MAYOR USO DE VRAM/);
  assert.match(page, /XOC ·.*MHz/);
  assert.match(bridge, /Win32_PerfFormattedData_Counters_ProcessorInformation/);
  assert.match(bridge, /clocks\.current\.graphics/);
  assert.match(bridge, /GPUProcessMemory/);
  assert.match(bridge, /averageGpuClockOffsetMhz/);
  assert.match(bridge, /memoryOcOffsetMhz/);
  assert.equal(references.cpus[0].baseMHz, 3800);
  assert.equal(references.cpus[0].boostMHz, 4600);
  assert.equal(references.gpus[0].coreBaseMHz, 2310);
  assert.equal(references.gpus[0].coreBoostMHz, 2570);
});

test("interactive dashboard maps hardware and persists module preferences", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /MAPA VIVO DE TU PC/);
  assert.match(page, /PERSONALIZAR MÓDULOS/);
  assert.match(page, /Diagrama interactivo de la PC/);
  assert.match(page, /pc-diagram-v0\.6\.png/);
  assert.match(styles, /\.cpu-hotspot/);
  assert.match(styles, /\.gpu-hotspot/);
  assert.match(page, /reebot_dashboard_preferences/);
  assert.match(page, /ESENCIAL.*EQUILIBRIO.*TÉCNICO/s);
  assert.match(page, /role="dialog" aria-modal="true"/);
  for (const part of ["cpu", "gpu", "memory", "disk"]) {
    assert.match(styles, new RegExp(`data-hardware=["']${part}["']`));
  }
});

test("REEBI uses automated low-cost 2D sprite animations", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /type MascotAnimation = "idle" \| "sleep" \| "wave" \| "sparkle" \| "analyze" \| "alert"/);
  assert.match(page, /data-animation=\{mascotAnimation\}/);
  assert.match(styles, /reebi-sprites-v0\.6\.png/);
  for (const animation of ["reebi-idle", "reebi-sleep", "reebi-wave", "reebi-sparkle", "reebi-analyze", "reebi-alert-frames"]) {
    assert.match(styles, new RegExp(`@keyframes ${animation}`));
  }
  assert.doesNotMatch(page, /mascot-image/);
});

test("direct process changes are allowlisted, confirmed, reversible and local-only", async () => {
  const bridge = await readFile(new URL("../telemetry-server.ps1", import.meta.url), "utf8");
  const watchdog = await readFile(new URL("../resume-process.ps1", import.meta.url), "utf8");
  assert.match(bridge, /\/optimization\/scan/);
  assert.match(bridge, /\/actions\/execute/);
  assert.match(bridge, /CONFIRMADO_POR_USUARIO/);
  assert.match(bridge, /Test-IsLocalAppOrigin/);
  assert.match(bridge, /NtSuspendProcess/);
  assert.match(bridge, /undoToken/);
  assert.match(bridge, /Get-ValidatedActionProcess/);
  assert.match(watchdog, /NtResumeProcess/);
  assert.match(watchdog, /ExpectedStartTicks/);
});

test("incremental updater requires release digests and preserves the old version", async () => {
  const updater = await readFile(new URL("../launcher/ReebotUpdater.cs", import.meta.url), "utf8");
  const applyUpdate = await readFile(new URL("../apply-update.ps1", import.meta.url), "utf8");
  const buildUpdate = await readFile(new URL("../build-update-package.ps1", import.meta.url), "utf8");
  assert.match(updater, /api\.github\.com\/repos\/estebannlhrnaud-droid\/Reebot-Lab\/releases/);
  assert.match(updater, /sha256:/);
  assert.match(updater, /REEBOT-LAB-update-v/);
  assert.match(updater, /ComputeSha256/);
  assert.match(applyUpdate, /app-\$BaseVersion/);
  assert.match(applyUpdate, /app-\$TargetVersion/);
  assert.match(applyUpdate, /StartsWith\(\$targetPrefix/);
  assert.doesNotMatch(applyUpdate, /Remove-Item[^\n]+\$baseRoot/);
  assert.match(buildUpdate, /changedPaths/);
  assert.match(buildUpdate, /deletePaths/);
});
