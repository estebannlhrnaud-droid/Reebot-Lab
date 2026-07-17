"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

type Process = {
  name: string;
  pid: number;
  cpu: number;
  ram: number;
  vram?: number;
  priority?: string;
  company?: string | null;
  canOptimize?: boolean;
  protectionReason?: string;
  paused?: boolean;
};
type Metrics = {
  cpu: number;
  cpuName: string;
  cpuCores: number;
  cpuThreads: number;
  cpuClock: number;
  cpuBaseClock: number;
  cpuBoostClock: number;
  cpuClockState: ClockState;
  cpuReferenceSource: string;
  memory: number;
  gpu: number;
  gpuName: string;
  gpuTemp: number;
  gpuPower: number;
  gpuPowerLimit: number;
  gpuPstate: string;
  gpuCoreClock: number;
  gpuCoreBaseClock: number;
  gpuCoreBoostClock: number;
  gpuClockState: ClockState;
  gpuMemoryClock: number;
  gpuMemoryStockClock: number;
  gpuMemoryClockState: ClockState;
  gpuManualOcDetected: boolean;
  gpuManualCoreOffset: number;
  gpuManualMemoryOffset: number;
  gpuManualOcSource: string | null;
  gpuReferenceSource: string;
  vram: number;
  vramUsed: number;
  vramTotal: number;
  vramTopProcess: { name: string; pid: number; used: number };
  disk: number;
  read: number;
  write: number;
  time: string;
  uptime: string;
  memoryUsed: number;
  memoryTotal: number;
  diskName: string;
  diskFree: number;
  processes: Process[];
};
type View = "inicio" | "chat" | "lab" | "procesos" | "ajustes";
type Experience = "nuevo" | "intermedio" | "experto";
type MascotMood = "calm" | "focused" | "playful";
type MascotAnimation = "idle" | "sleep" | "wave" | "sparkle" | "analyze" | "alert";
type Status = "neutral" | "healthy" | "active" | "warning" | "critical" | "special";
type ClockState = "unknown" | "base" | "boost" | "xoc_possible" | "xoc_manual";
type TelemetryPoint = { cpu: number; gpu: number; vram: number };
type HardwareKind = "cpu" | "gpu" | "memory" | "disk";
type ModuleSize = "small" | "medium" | "large";
type ModuleDensity = "essential" | "balanced" | "technical";
type ModulePreference = { size: ModuleSize; density: ModuleDensity };
type DashboardPreferences = Record<HardwareKind, ModulePreference>;
type ChatMessage = { role: "user" | "assistant"; content: string };
type AiState = { engine: "checking" | "ollama" | "basic"; model: string | null; reason: string };
type AiReply = { reply?: string; engine?: "ollama" | "basic"; model?: string | null; reason?: string; error?: string };
type Notice = { status: Status; symbol: string; title: string; copy: string; action?: { label: string; view: View } };
type BridgePhase = "checking" | "offline" | "pairing" | "connected";
type BridgeState = { phase: BridgePhase; available: boolean; model: string | null; reason: string; version: string | null };
type BridgeStatusPayload = { available?: boolean; paired?: boolean; version?: string; engine?: "ollama" | "basic"; model?: string | null; reason?: string; error?: string };
type OptimizationRecommendation = {
  planId: string;
  expiresAt: string;
  pid: number;
  name: string;
  company?: string | null;
  cpu: number;
  ram: number;
  priority: string;
  action: "priority_low" | "pause_5m";
  actionLabel: string;
  summary: string;
  reason: string;
  benefit: string;
  risk: "bajo" | "medio";
};
type OptimizationScan = { engine?: "ollama" | "rules"; model?: string | null; message?: string; recommendations?: OptimizationRecommendation[]; error?: string };
type OptimizationActionResult = { ok?: boolean; action?: string; pid?: number; name?: string; message?: string; undoToken?: string; error?: string };

const BRIDGE_URL = "http://127.0.0.1:47831";

function bridgeHeaders(token: string, includeJson = false) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (includeJson) headers["Content-Type"] = "application/json";
  return headers;
}

const fallback: Metrics = {
  cpu: 18,
  cpuName: "AMD Ryzen 7 5700G",
  cpuCores: 8,
  cpuThreads: 16,
  cpuClock: 3800,
  cpuBaseClock: 3800,
  cpuBoostClock: 4600,
  cpuClockState: "base",
  cpuReferenceSource: "AMD — referencia oficial",
  memory: 56,
  gpu: 8,
  gpuName: "NVIDIA GeForce RTX 5050",
  gpuTemp: 41,
  gpuPower: 18,
  gpuPowerLimit: 130,
  gpuPstate: "P8",
  gpuCoreClock: 2310,
  gpuCoreBaseClock: 2310,
  gpuCoreBoostClock: 2570,
  gpuClockState: "xoc_manual",
  gpuMemoryClock: 10000,
  gpuMemoryStockClock: 10000,
  gpuMemoryClockState: "xoc_manual",
  gpuManualOcDetected: true,
  gpuManualCoreOffset: 85,
  gpuManualMemoryOffset: 200,
  gpuManualOcSource: "NVIDIA App / Afinamiento automático",
  gpuReferenceSource: "NVIDIA — referencia oficial",
  vram: 22,
  vramUsed: 1.8,
  vramTotal: 8,
  vramTopProcess: { name: "Sin datos", pid: 0, used: 0 },
  disk: 12,
  read: 0,
  write: 0,
  time: "--:--:--",
  uptime: "--",
  memoryUsed: 8.9,
  memoryTotal: 15.9,
  diskName: "Disco 1 - SSD 1TB (E:)",
  diskFree: 817.6,
  processes: [
    { name: "steamwebhelper", pid: 18856, cpu: 2.8, ram: 417.7 },
    { name: "wallpaper64", pid: 7700, cpu: 1.6, ram: 341.7 },
    { name: "ChatGPT", pid: 8380, cpu: 1.1, ram: 278.8 },
  ],
};

const defaultDashboardPreferences: DashboardPreferences = {
  cpu: { size: "medium", density: "balanced" },
  gpu: { size: "medium", density: "technical" },
  memory: { size: "small", density: "balanced" },
  disk: { size: "small", density: "essential" },
};

const moduleSpan: Record<ModuleSize, number> = { small: 2, medium: 4, large: 6 };

const profiles = {
  Gaming: { copy: "Priorizo FPS estables y vigilo memoria de video, temperatura y carga.", mood: "focused" as MascotMood, theme: "gaming" },
  Studio: { copy: "Cuido la fluidez al editar video, imagen y audio, sin perder trabajo en segundo plano.", mood: "focused" as MascotMood, theme: "studio" },
  Chill: { copy: "Bajo el ritmo, reduzco el ruido y observo sólo lo importante.", mood: "calm" as MascotMood, theme: "chill" },
  Movie: { copy: "Cuido una reproducción estable, silenciosa y sin interrupciones.", mood: "calm" as MascotMood, theme: "movie" },
};

const views: { id: View; label: string }[] = [
  { id: "inicio", label: "Inicio" },
  { id: "chat", label: "Conversación" },
  { id: "lab", label: "Laboratorio" },
  { id: "procesos", label: "Procesos" },
  { id: "ajustes", label: "Ajustes" },
];

const labels: Record<View, string> = {
  inicio: "Sistema / Inicio",
  chat: "Sistema / Conversación",
  lab: "Sistema / Laboratorio",
  procesos: "Sistema / Procesos",
  ajustes: "Sistema / Ajustes",
};

const statusLabels: Record<Status, string> = {
  neutral: "SIN DATOS",
  healthy: "ESTABLE",
  active: "EN ACTIVIDAD",
  warning: "EN OBSERVACIÓN",
  critical: "CRÍTICO",
  special: "DESCUBRIMIENTO",
};

const suggestedQuestions = ["¿Qué está usando mi RAM?", "¿Mi disco está lento?", "¿Ves algún proceso sospechoso?"];

function cpuStatus(value: number, connected: boolean): Status {
  if (!connected) return "neutral";
  if (value >= 96) return "critical";
  if (value >= 85) return "warning";
  if (value >= 50) return "active";
  return "healthy";
}

function gpuStatus(value: number, temperature: number, connected: boolean): Status {
  if (!connected) return "neutral";
  if (temperature >= 88) return "critical";
  if (temperature >= 80) return "warning";
  if (value >= 35) return "active";
  return "healthy";
}

function memoryStatus(value: number, connected: boolean): Status {
  if (!connected) return "neutral";
  if (value >= 94) return "critical";
  if (value >= 80) return "warning";
  if (value >= 68) return "active";
  return "healthy";
}

function diskStatus(value: number, connected: boolean): Status {
  if (!connected) return "neutral";
  if (value >= 95) return "warning";
  if (value >= 55) return "active";
  return "healthy";
}

function metricDescription(kind: "cpu" | "gpu" | "memory" | "disk", status: Status) {
  if (status === "neutral") return "Esperando telemetría del equipo.";
  if (kind === "gpu" && status === "active") return "Está trabajando, no sufriendo.";
  if (kind === "gpu" && status === "warning") return "La temperatura merece atención.";
  if (kind === "memory" && status === "warning") return "Empieza a quedarse con poco margen.";
  if (status === "critical") return "Necesita atención inmediata.";
  if (status === "warning") return "Carga alta; conviene observarla.";
  if (status === "active") return "Está resolviendo una carga exigente.";
  if (kind === "disk") return "La unidad responde con normalidad.";
  return "Dentro de su rango habitual.";
}

export default function Home() {
  const [view, setView] = useState<View>("inicio");
  const [mode, setMode] = useState<keyof typeof profiles>("Studio");
  const [experience, setExperience] = useState<Experience>("intermedio");
  const [mascotMood, setMascotMood] = useState<MascotMood>("calm");
  const [mascotTouched, setMascotTouched] = useState(false);
  const [mascotReaction, setMascotReaction] = useState(0);
  const [mascotAction, setMascotAction] = useState<"wave" | "sparkle" | null>(null);
  const [mascotAutoPhase, setMascotAutoPhase] = useState(0);
  const [metrics, setMetrics] = useState<Metrics>(fallback);
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryPoint[]>([]);
  const [dashboardEditing, setDashboardEditing] = useState(false);
  const [dashboardPreferences, setDashboardPreferences] = useState<DashboardPreferences>(defaultDashboardPreferences);
  const [dashboardPreferencesReady, setDashboardPreferencesReady] = useState(false);
  const [selectedHardware, setSelectedHardware] = useState<HardwareKind | null>(null);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [question, setQuestion] = useState("¿Por qué estabas lenta hace rato?");
  const [reply, setReply] = useState("Estoy escuchando.");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [aiState, setAiState] = useState<AiState>({ engine: "checking", model: null, reason: "Buscando un motor de IA local." });
  const [bridgeToken, setBridgeToken] = useState(() => typeof window === "undefined" ? "" : window.localStorage.getItem("reebot_bridge_token") || "");
  const [pairCode, setPairCode] = useState("");
  const [localPairCode, setLocalPairCode] = useState<string | null>(null);
  const [pairError, setPairError] = useState("");
  const [bridge, setBridge] = useState<BridgeState>({ phase: "checking", available: false, model: null, reason: "Buscando el agente local de REEBOT.", version: null });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem("reebot_dashboard_preferences");
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<DashboardPreferences>;
          const next = { ...defaultDashboardPreferences };
          (Object.keys(next) as HardwareKind[]).forEach((kind) => {
            const candidate = parsed[kind];
            const validSize = candidate && (["small", "medium", "large"] as ModuleSize[]).includes(candidate.size);
            const validDensity = candidate && (["essential", "balanced", "technical"] as ModuleDensity[]).includes(candidate.density);
            if (candidate && validSize && validDensity) next[kind] = candidate;
          });
          setDashboardPreferences(next);
        }
      } catch {}
      setDashboardPreferencesReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (dashboardPreferencesReady) window.localStorage.setItem("reebot_dashboard_preferences", JSON.stringify(dashboardPreferences));
  }, [dashboardPreferences, dashboardPreferencesReady]);

  useEffect(() => {
    if (!selectedHardware) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedHardware(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedHardware]);

  useEffect(() => {
    if (view !== "inicio") return;
    const timer = window.setInterval(() => setMascotAutoPhase((current) => current + 1), 6500);
    return () => window.clearInterval(timer);
  }, [view]);

  useEffect(() => {
    if (!mascotAction) return;
    const timer = window.setTimeout(() => setMascotAction(null), 2400);
    return () => window.clearTimeout(timer);
  }, [mascotAction]);

  const refreshBridge = useCallback(async (tokenOverride?: string) => {
    const token = tokenOverride ?? bridgeToken;
    try {
      const response = await fetch(`${BRIDGE_URL}/bridge/status`, { cache: "no-store", mode: "cors", headers: bridgeHeaders(token) });
      const payload = (await response.json()) as BridgeStatusPayload;
      if (response.ok && payload.paired) {
        setBridge({ phase: "connected", available: true, model: payload.model || null, reason: payload.reason || "Tu PC está vinculada.", version: payload.version || null });
        setPairError("");
      } else if (response.status === 401 && payload.available) {
        setBridge({ phase: "pairing", available: true, model: null, reason: payload.reason || "Ingresa el código mostrado por el agente local.", version: payload.version || null });
      } else {
        throw new Error(payload.error || "El agente local no respondió.");
      }

      if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        const codeResponse = await fetch(`${BRIDGE_URL}/pair-code`, { cache: "no-store", mode: "cors" });
        if (codeResponse.ok) {
          const codePayload = (await codeResponse.json()) as { code?: string };
          setLocalPairCode(codePayload.code || null);
        }
      }
    } catch {
      setBridge({ phase: "offline", available: false, model: null, reason: "Abre el agente local para conectar esta página con tu PC.", version: null });
      setLocalPairCode(null);
    }
  }, [bridgeToken]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refreshBridge(bridgeToken), 0);
    const timer = window.setInterval(() => void refreshBridge(), 15000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [bridgeToken, refreshBridge]);

  useEffect(() => {
    if (paused || bridge.phase !== "connected") {
      return;
    }
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(`${BRIDGE_URL}/metrics`, { cache: "no-store", mode: "cors", headers: bridgeHeaders(bridgeToken) });
        if (!response.ok) throw new Error("Telemetría no autorizada.");
        const payload = (await response.json()) as Partial<Metrics>;
        if (active) {
          const next = { ...fallback, ...payload, vramTopProcess: payload.vramTopProcess || fallback.vramTopProcess } as Metrics;
          setMetrics(next);
          setTelemetryHistory((current) => [...current, { cpu: next.cpu, gpu: next.gpu, vram: next.vram }].slice(-36));
          setConnected(true);
        }
      } catch {
        if (active) setConnected(false);
      }
    };
    void poll();
    const timer = window.setInterval(poll, 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [bridge.phase, bridgeToken, paused]);

  useEffect(() => {
    let active = true;
    const detectAi = async () => {
      try {
        const localReady = bridge.phase === "connected";
        const response = await fetch(localReady ? `${BRIDGE_URL}/ai/status` : "/api/ai/status", {
          cache: "no-store",
          mode: localReady ? "cors" : "same-origin",
          headers: localReady ? bridgeHeaders(bridgeToken) : undefined,
        });
        if (!response.ok) throw new Error("El motor no respondió.");
        const payload = (await response.json()) as { engine?: "ollama" | "basic"; model?: string | null; reason?: string };
        if (active) setAiState({ engine: payload.engine || "basic", model: payload.model || null, reason: payload.reason || "Motor local no disponible." });
      } catch {
        try {
          const response = await fetch("/api/ai/status", { cache: "no-store" });
          const payload = (await response.json()) as { engine?: "ollama" | "basic"; model?: string | null; reason?: string };
          if (active) setAiState({ engine: payload.engine || "basic", model: payload.model || null, reason: payload.reason || "Usaré el análisis básico." });
        } catch {
          if (active) setAiState({ engine: "basic", model: null, reason: "No pude consultar el motor local; usaré el análisis básico." });
        }
      }
    };
    void detectAi();
    return () => {
      active = false;
    };
  }, [bridge.phase, bridgeToken]);

  const telemetryConnected = connected && bridge.phase === "connected";

  const statuses = useMemo(
    () => ({
      cpu: cpuStatus(metrics.cpu, telemetryConnected),
      gpu: gpuStatus(metrics.gpu, metrics.gpuTemp, telemetryConnected),
      memory: memoryStatus(metrics.memory, telemetryConnected),
      disk: diskStatus(metrics.disk, telemetryConnected),
    }),
    [metrics, telemetryConnected],
  );

  const systemStatus = useMemo<Status>(() => {
    const values = Object.values(statuses);
    if (values.includes("critical")) return "critical";
    if (values.includes("warning")) return "warning";
    if (!telemetryConnected) return "neutral";
    if (values.includes("active")) return "active";
    return "healthy";
  }, [statuses, telemetryConnected]);

  const systemHeadline = useMemo(() => {
    if (systemStatus === "neutral") return "Aún no puedo sentir tu PC.";
    if (systemStatus === "critical") return "Hay algo que necesita atención ahora.";
    if (systemStatus === "warning") return "Encontré una señal que conviene revisar.";
    if (statuses.gpu === "active") return "Tu equipo está trabajando con intención.";
    if (systemStatus === "active") return "Hay actividad, pero todo sigue bajo control.";
    return "Todo está tranquilo.";
  }, [statuses.gpu, systemStatus]);

  const reeStatus: Status = thinking
    ? "active"
    : systemStatus === "critical" || systemStatus === "warning"
      ? systemStatus
      : mascotTouched
        ? "special"
        : telemetryConnected
          ? "healthy"
          : "neutral";

  const mascotAnimation = useMemo<MascotAnimation>(() => {
    if (mascotAction) return mascotAction;
    if (thinking) return "analyze";
    if (systemStatus === "critical" || systemStatus === "warning") return "alert";
    if (mascotMood === "focused") return "analyze";
    const lowLoad = metrics.cpu < 24 && metrics.gpu < 18;
    if (lowLoad && mascotAutoPhase % 4 === 2) return "sleep";
    if (telemetryConnected && mascotAutoPhase % 5 === 4) return "sparkle";
    return "idle";
  }, [mascotAction, mascotAutoPhase, mascotMood, metrics.cpu, metrics.gpu, systemStatus, telemetryConnected, thinking]);

  const reeMessage = useMemo(() => {
    if (thinking) return "Dame un momento. Estoy conectando las pistas.";
    if (systemStatus === "critical") return "Encontré algo que debemos atender ahora.";
    if (statuses.memory === "warning") return "La memoria empieza a quedarse corta.";
    if (statuses.gpu === "warning") return "La GPU necesita un poco de aire.";
    if (statuses.disk === "warning") return "Tu disco está muy ocupado. Lo estoy observando.";
    if (statuses.gpu === "active") return "Tu GPU está trabajando, no sufriendo.";
    if (mascotTouched && mascotMood === "playful") return "Hola. Tu PC tiene mucho que contar.";
    if (mascotTouched && mascotMood === "focused") return "Modo técnico activado. Vamos pista por pista.";
    if (mascotTouched) return "Estoy aquí. Dime qué quieres entender.";
    if (!telemetryConnected) return "Estoy lista. Conecta la telemetría para verme trabajar.";
    return "Todo está tranquilo.";
  }, [mascotMood, mascotTouched, statuses, systemStatus, telemetryConnected, thinking]);

  const notices = useMemo<Notice[]>(() => {
    const items: Notice[] = [];
    if (!telemetryConnected) {
      items.push({ status: "neutral", symbol: "○", title: "TELEMETRÍA EN ESPERA", copy: "La interfaz usa datos de demostración hasta reconectar el monitor local." });
    }
    if (thinking) {
      items.push({ status: "active", symbol: "⌁", title: "REEBI ESTÁ ANALIZANDO", copy: "Está comparando actividad, temperatura y procesos antes de responder." });
    }
    if (statuses.gpu === "critical") {
      items.push({ status: "critical", symbol: "!", title: "TEMPERATURA CRÍTICA", copy: "Conviene detener la carga y revisar ventilación.", action: { label: "PREGUNTAR A REEBI", view: "chat" } });
    } else if (statuses.gpu === "warning") {
      items.push({ status: "warning", symbol: "△", title: "GPU EN OBSERVACIÓN", copy: "La carga es válida; la temperatura es lo que debemos vigilar.", action: { label: "REVISAR", view: "chat" } });
    }
    if (statuses.memory === "critical" || statuses.memory === "warning") {
      items.push({ status: statuses.memory, symbol: "Ⅱ", title: "MEMORIA ELEVADA", copy: "Algunas aplicaciones están consumiendo más de lo habitual.", action: { label: "VER PROCESOS", view: "procesos" } });
    }
    if (statuses.disk === "warning") {
      items.push({ status: "warning", symbol: "◇", title: "DISCO MUY ACTIVO", copy: "La unidad está ocupada; actividad alta no significa que esté llena.", action: { label: "ABRIR LAB", view: "lab" } });
    }
    if (items.length === 0 && statuses.gpu === "active") {
      items.push({ status: "active", symbol: "⌁", title: "GPU EN ACTIVIDAD", copy: "Está resolviendo una carga exigente y su temperatura sigue normal." });
    }
    if (items.length === 0) {
      items.push({ status: "healthy", symbol: "✓", title: "TODO EN ORDEN", copy: "Tu sistema responde con normalidad. No necesitas hacer nada." });
    }
    if (aiState.engine === "ollama" && items.length < 2) {
      items.push({ status: "special", symbol: "✦", title: "IA LOCAL LISTA", copy: "REEBI puede interpretar lo que ocurre sin enviar tus métricas a la nube.", action: { label: "CONVERSAR", view: "chat" } });
    }
    return items.slice(0, 2);
  }, [aiState.engine, statuses, telemetryConnected, thinking]);

  const pairBridge = async () => {
    if (!/^\d{6}$/.test(pairCode)) {
      setPairError("Escribe el código de seis dígitos que muestra el agente local.");
      return;
    }
    setPairError("");
    setBridge((current) => ({ ...current, phase: "checking", reason: "Vinculando esta página con tu PC." }));
    try {
      const response = await fetch(`${BRIDGE_URL}/pair`, {
        method: "POST",
        mode: "cors",
        headers: bridgeHeaders("", true),
        body: JSON.stringify({ code: pairCode }),
      });
      const payload = (await response.json()) as { token?: string; error?: string };
      if (!response.ok || !payload.token) throw new Error(payload.error || "No pude vincular la PC.");
      window.localStorage.setItem("reebot_bridge_token", payload.token);
      setBridgeToken(payload.token);
      setPairCode("");
      await refreshBridge(payload.token);
    } catch (error) {
      setPairError(error instanceof Error ? error.message : "No pude vincular la PC.");
      setBridge((current) => ({ ...current, phase: bridge.available ? "pairing" : "offline" }));
    }
  };

  const disconnectBridge = async () => {
    try {
      await fetch(`${BRIDGE_URL}/bridge/revoke`, { method: "POST", mode: "cors", headers: bridgeHeaders(bridgeToken, true) });
    } finally {
      window.localStorage.removeItem("reebot_bridge_token");
      setBridgeToken("");
      setConnected(false);
      setPairCode("");
      await refreshBridge("");
    }
  };

  const ask = async (override?: string) => {
    const message = (override || question).trim();
    if (!message || thinking) return;
    setQuestion(message);
    setThinking(true);
    setMascotMood("focused");
    setMascotTouched(false);
    setReply("Estoy cruzando tu pregunta con las métricas actuales...");
    try {
      const requestBody = JSON.stringify({ message, history: history.slice(-8), metrics, profile: mode, experience });
      const endpoints = bridge.phase === "connected"
        ? [{ url: `${BRIDGE_URL}/ai/chat`, local: true }, { url: "/api/ai/chat", local: false }]
        : [{ url: "/api/ai/chat", local: false }];
      let payload: AiReply | null = null;
      let lastError = "La IA no respondió.";
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint.url, {
            method: "POST",
            mode: endpoint.local ? "cors" : "same-origin",
            headers: endpoint.local ? bridgeHeaders(bridgeToken, true) : { "Content-Type": "application/json" },
            body: requestBody,
          });
          const candidate = (await response.json()) as AiReply;
          if (!response.ok || !candidate.reply) {
            lastError = candidate.error || "La IA no respondió.";
            continue;
          }
          payload = candidate;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error.message : lastError;
        }
      }
      if (!payload?.reply) throw new Error(lastError);
      setReply(payload.reply);
      setHistory((current) => [...current, { role: "user", content: message }, { role: "assistant", content: payload.reply as string }].slice(-10));
      setAiState({ engine: payload.engine || "basic", model: payload.model || null, reason: payload.reason || "Respuesta procesada localmente." });
    } catch (error) {
      setReply(error instanceof Error ? `No pude responder todavía: ${error.message}` : "No pude responder todavía.");
      setAiState({ engine: "basic", model: null, reason: "El servicio local no está disponible." });
    } finally {
      setThinking(false);
      setMascotMood(profiles[mode].mood);
    }
  };

  const aiLabel = aiState.engine === "ollama" ? `IA LOCAL · ${aiState.model}` : aiState.engine === "checking" ? "BUSCANDO IA LOCAL" : "ANÁLISIS BÁSICO LOCAL";

  const chooseMode = (next: keyof typeof profiles) => {
    setMode(next);
    setMascotMood(profiles[next].mood);
    setMascotTouched(false);
  };

  const updateModulePreference = (kind: HardwareKind, patch: Partial<ModulePreference>) => {
    setDashboardPreferences((current) => ({ ...current, [kind]: { ...current[kind], ...patch } }));
  };

  const cycleMascotMood = () => {
    setMascotTouched(true);
    setMascotReaction((value) => value + 1);
    setMascotAction(mascotReaction % 2 === 0 ? "wave" : "sparkle");
    setMascotMood((current) => (current === "calm" ? "focused" : current === "focused" ? "playful" : "calm"));
  };

  const openConversation = (prompt?: string) => {
    if (prompt) setQuestion(prompt);
    setView("chat");
  };

  return (
    <main className="app-shell" data-mood={mascotMood} data-profile={profiles[mode].theme}>
      <header className="brand-header">
        <div className="brand-lockup" aria-label="REEBOT LAB">
          <span className="brand-reebot">REEBOT</span>
          <span className="brand-lab">LAB</span>
          <span className="brand-star" aria-hidden="true"><i />✦<i /></span>
        </div>
        <div className="brand-meta"><span>PERSONAL COMPUTER COMPANION</span><b>INTERACTIVE SYSTEM MAP / 0.6.0</b></div>
      </header>

      <div className="workspace">
        <nav className="side-rail" aria-label="Navegación principal">
          {views.map((item, index) => (
            <button key={item.id} className={view === item.id ? "rail-item active" : "rail-item"} onClick={() => setView(item.id)} aria-current={view === item.id ? "page" : undefined}>
              <span>{String(index + 1).padStart(2, "0")}</span><b>{item.label}</b>
            </button>
          ))}
          <div className="rail-status" data-status={telemetryConnected ? "healthy" : "neutral"}><i />{telemetryConnected ? "EN VIVO" : "DEMO"}</div>
        </nav>

        <section className="content-area">
          <div className="content-topline">
            <span>{labels[view]}</span>
            <div><span className="analysis-dot" data-status={paused ? "neutral" : thinking ? "active" : telemetryConnected ? "healthy" : "neutral"} />{paused ? "MONITOREO EN PAUSA" : "ANALIZANDO EN TIEMPO REAL"}<button onClick={() => setPaused((value) => !value)}>{paused ? "REANUDAR" : "PAUSAR"}</button></div>
          </div>

          {view === "inicio" && (
            <div className="home-flow">
              <section className="hero-grid" aria-label="Estado general y REEBI">
                <article className="module black system-overview status-surface" data-status={systemStatus}>
                  <ModuleTop code="SYS/OVERVIEW-00" status={systemStatus} label={statusLabels[systemStatus]} />
                  <div className="overview-copy">
                    <p className="eyebrow">ESTADO GENERAL DE NÉBULA</p>
                    <h1>{systemHeadline}</h1>
                    <p>{profiles[mode].copy} {telemetryConnected ? "Estoy leyendo tu equipo en tiempo real." : "Ahora mismo trabajo con una simulación segura."}</p>
                  </div>
                  <div className="profile-row"><span>MODO PREFERIDO</span><div>{(Object.keys(profiles) as (keyof typeof profiles)[]).map((profile) => <button key={profile} className={mode === profile ? "active" : ""} onClick={() => chooseMode(profile)}>{profile}</button>)}</div></div>
                </article>

                <article className="mascot-card status-surface" data-status={reeStatus} data-reaction={mascotReaction % 2} data-animation={mascotAnimation}>
                  <div className="mascot-top"><span>REEBI / ID-001</span><StatusTag status={reeStatus} label={thinking ? "ANALIZANDO" : statusLabels[reeStatus]} /></div>
                  <div className="construction-mark mark-a" aria-hidden="true" /><div className="construction-mark mark-b" aria-hidden="true" />
                  <div className="mascot-glow" aria-hidden="true" />
                  <div className="mascot-speech" role="status" aria-live="polite"><span>REEBI DICE</span><p>{reeMessage}</p><button onClick={() => openConversation("¿Qué estás viendo en mi PC?")}>HABLAR CON REEBI ↗</button></div>
                  <button className="mascot-button" onClick={cycleMascotMood} aria-label={`Interactuar con REEBI. Animación actual: ${mascotAnimation}`}>
                    <span className="mascot-sprite" aria-hidden="true" />
                  </button>
                  <div className="mascot-caption">TOCA A REEBI PARA INTERACTUAR</div>
                </article>
              </section>

              <section className="pc-map-section" aria-labelledby="pc-map-title">
                <div className="section-heading dashboard-heading"><span id="pc-map-title">MAPA VIVO DE TU PC</span><div><small>SELECCIONA UN COMPONENTE</small><button className={dashboardEditing ? "active" : ""} onClick={() => setDashboardEditing((value) => !value)}>{dashboardEditing ? "TERMINAR" : "PERSONALIZAR MÓDULOS"}</button></div></div>
                <PcHardwareMap metrics={metrics} statuses={statuses} onSelect={setSelectedHardware} />
                {dashboardEditing && <div className="dashboard-edit-note"><b>MODO EDICIÓN</b><span>Cambia cuánto espacio ocupa cada módulo y cuánta información muestra. Tus preferencias se guardan sólo en esta PC.</span></div>}
              </section>

              <section className="metric-grid" aria-label="Métricas principales">
                <CpuPerformanceCard metrics={metrics} history={telemetryHistory} status={statuses.cpu} preference={dashboardPreferences.cpu} editing={dashboardEditing} onPreference={(patch) => updateModulePreference("cpu", patch)} onOpen={() => setSelectedHardware("cpu")} />
                <GpuPerformanceCard metrics={metrics} history={telemetryHistory} status={statuses.gpu} preference={dashboardPreferences.gpu} editing={dashboardEditing} onPreference={(patch) => updateModulePreference("gpu", patch)} onOpen={() => setSelectedHardware("gpu")} />
                <MetricCard hardware="memory" code="SYS/RAM-03" label="RAM" value={metrics.memory} status={statuses.memory} description={metricDescription("memory", statuses.memory)} meta={`${metrics.memoryUsed.toFixed(1)}/${metrics.memoryTotal.toFixed(1)} GB`} technicalMeta={`${metrics.processes[0]?.name || "Sin procesos"} · ${metrics.processes[0]?.ram.toFixed(0) || 0} MB`} preference={dashboardPreferences.memory} editing={dashboardEditing} onPreference={(patch) => updateModulePreference("memory", patch)} onOpen={() => setSelectedHardware("memory")} />
                <MetricCard hardware="disk" code="STO/DSK-04" label="DISCO E:" value={metrics.disk} status={statuses.disk} description={metricDescription("disk", statuses.disk)} meta={`${metrics.write.toFixed(1)} MB/S ESCRITURA`} technicalMeta={`${metrics.read.toFixed(1)} MB/S LECTURA · ${metrics.diskFree.toFixed(0)} GB LIBRES`} preference={dashboardPreferences.disk} editing={dashboardEditing} onPreference={(patch) => updateModulePreference("disk", patch)} onOpen={() => setSelectedHardware("disk")} />
              </section>

              {selectedHardware && <HardwareDetailPanel kind={selectedHardware} metrics={metrics} history={telemetryHistory} status={statuses[selectedHardware]} onClose={() => setSelectedHardware(null)} />}

              <section className="notice-section" aria-labelledby="notice-title">
                <div className="section-heading"><span id="notice-title">SEÑALES RELEVANTES</span><small>{String(notices.length).padStart(2, "0")} ACTIVAS</small></div>
                <div className="notice-grid">{notices.map((notice) => <NoticeCard key={notice.title} notice={notice} onNavigate={setView} />)}</div>
              </section>

              <section className="lower-grid">
                <article className="module black experiment-card status-surface" data-status={statuses.disk === "warning" ? "warning" : "special"}>
                  <ModuleTop code="LAB/EXPERIMENT-01" status={statuses.disk === "warning" ? "warning" : "special"} label="LISTO PARA PROBAR" />
                  <div><p className="eyebrow">ACCIÓN RECOMENDADA</p><h2>{statuses.disk === "warning" ? "Entender la actividad del SSD" : "Comprobar la velocidad real del SSD"}</h2><p>Una prueba guiada puede medir, comparar y explicar el resultado sin cambiar tu configuración.</p></div>
                  <div className="experiment-flow"><b>MEDIR</b><span>→</span><b>PROBAR</b><span>→</span><b>COMPARAR</b><span>→</span><b>EXPLICAR</b></div>
                  <div className="experiment-actions"><button onClick={() => setReply("Te explicaré cada paso y no ejecutaré nada sin tu permiso.")}>SÓLO EXPLÍCAME</button><button className="light" onClick={() => setView("lab")}>HACERLO JUNTOS</button></div>
                </article>
                <article className="conversation-card status-surface" data-status={thinking ? "active" : "special"}>
                  <div className="module-top"><span>REEBI/CHAT-02</span><div className={`ai-badge ${aiState.engine}`} title={aiState.reason}><i />{aiLabel}</div></div>
                  <div><p className="eyebrow">CONVERSACIÓN DIRECTA</p><h2>Pregúntale algo a tu PC.</h2></div>
                  <div className="quick-chat"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void ask(); }} aria-label="Pregunta para REEBI" /><button disabled={thinking} onClick={() => void ask()}>{thinking ? "PENSANDO" : "ENVIAR ↗"}</button></div>
                  <p className={thinking ? "assistant-message thinking" : "assistant-message"} aria-live="polite">{reply}</p>
                </article>
              </section>
            </div>
          )}

          {view === "chat" && <ConversationView aiState={aiState} aiLabel={aiLabel} question={question} reply={reply} thinking={thinking} setQuestion={setQuestion} ask={ask} />}
          {view === "lab" && <LabView diskStatus={statuses.disk} />}
          {view === "procesos" && <ProcessesView metrics={metrics} memoryStatusValue={statuses.memory} bridgeConnected={bridge.phase === "connected"} bridgeToken={bridgeToken} profile={mode} experience={experience} />}
          {view === "ajustes" && <SettingsView experience={experience} setExperience={setExperience} aiLabel={aiLabel} aiState={aiState} bridge={bridge} pairCode={pairCode} setPairCode={setPairCode} localPairCode={localPairCode} pairError={pairError} onPair={pairBridge} onRetry={() => { setBridge((current) => ({ ...current, phase: "checking", reason: "Buscando el agente local de REEBOT." })); void refreshBridge(); }} onDisconnect={disconnectBridge} />}
        </section>
      </div>
    </main>
  );
}

function ModuleTop({ code, status, label }: { code: string; status: Status; label: string }) {
  return <div className="module-top"><span>{code}</span><StatusTag status={status} label={label} /></div>;
}

function StatusTag({ status, label }: { status: Status; label: string }) {
  return <span className="status-tag" data-status={status}><i />{label}</span>;
}

function ModuleEditorControls({ preference, onChange }: { preference: ModulePreference; onChange: (patch: Partial<ModulePreference>) => void }) {
  const sizes: { value: ModuleSize; label: string }[] = [{ value: "small", label: "S" }, { value: "medium", label: "M" }, { value: "large", label: "L" }];
  const densities: { value: ModuleDensity; label: string }[] = [{ value: "essential", label: "ESENCIAL" }, { value: "balanced", label: "EQUILIBRIO" }, { value: "technical", label: "TÉCNICO" }];
  return (
    <div className="module-editor" aria-label="Personalización del módulo">
      <div><span>TAMAÑO</span>{sizes.map((size) => <button key={size.value} aria-pressed={preference.size === size.value} onClick={() => onChange({ size: size.value })}>{size.label}</button>)}</div>
      <div><span>DETALLE</span>{densities.map((density) => <button key={density.value} aria-pressed={preference.density === density.value} onClick={() => onChange({ density: density.value })}>{density.label}</button>)}</div>
    </div>
  );
}

function OpenPanelButton({ onOpen }: { onOpen: () => void }) {
  return <button className="open-panel-button" onClick={onOpen}>VER PANEL <span aria-hidden="true">↗</span></button>;
}

function MetricCard({ hardware, code, label, value, status, description, meta, technicalMeta, preference, editing, onPreference, onOpen }: {
  hardware: HardwareKind;
  code: string;
  label: string;
  value: number;
  status: Status;
  description: string;
  meta: string;
  technicalMeta: string;
  preference: ModulePreference;
  editing: boolean;
  onPreference: (patch: Partial<ModulePreference>) => void;
  onOpen: () => void;
}) {
  return (
    <article
      className={`module black metric-card status-surface density-${preference.density}`}
      data-status={status}
      data-hardware={hardware}
      style={{ "--module-span": moduleSpan[preference.size] } as CSSProperties}
      aria-label={`${label}: ${Math.round(value)} por ciento, ${statusLabels[status]}`}
    >
      <div className="metric-head"><span>{code}</span><StatusTag status={status} label={statusLabels[status]} /></div>
      {editing && <ModuleEditorControls preference={preference} onChange={onPreference} />}
      <div className="metric-value"><strong>{Math.round(value)}</strong><span>%</span></div>
      <div className="metric-name"><b>{label}</b>{preference.density !== "essential" && <p>{description}</p>}</div>
      <div className="meter" role="progressbar" aria-label={`Uso de ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}><i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>
      <small>{meta}</small>
      {preference.density === "technical" && <small className="technical-meta">{technicalMeta}</small>}
      <OpenPanelButton onOpen={onOpen} />
    </article>
  );
}

function clockLabel(state: ClockState, offset = 0) {
  if (state === "xoc_manual") return `XOC · ${offset >= 0 ? "+" : ""}${Math.round(offset)} MHz`;
  if (state === "xoc_possible") return "XOC POSIBLE";
  if (state === "boost") return "BOOST";
  if (state === "base") return "BASE";
  return "SIN REFERENCIA";
}

function clockPosition(current: number, base: number, boost: number) {
  if (current <= 0 || base <= 0) return 0;
  if (current <= base) return Math.min(33.333, current / base * 33.333);
  if (boost <= base) return Math.min(100, 66.666 + (current - base) / (base * 0.1) * 33.333);
  const safeBoost = boost;
  if (current <= safeBoost) return 33.333 + (current - base) / (safeBoost - base) * 33.333;
  return Math.min(100, 66.666 + (current - safeBoost) / (safeBoost * 0.15) * 33.333);
}

function ClockBand({ label, current, base, boost, state, offset = 0 }: { label: string; current: number; base: number; boost: number; state: ClockState; offset?: number }) {
  const marker = clockPosition(current, base, boost);
  return (
    <div className="clock-band" data-clock-state={state}>
      <div className="clock-band-head"><span>{label}</span><b>{Math.round(current).toLocaleString("es-MX")} MHz · {clockLabel(state, offset)}</b></div>
      <div className="clock-band-track" aria-label={`${label}: ${Math.round(current)} megahertz, ${clockLabel(state, offset)}`}>
        <span>BASE</span><span>BOOST</span><span>XOC</span><i style={{ left: `${marker}%` }} />
      </div>
      <div className="clock-band-scale"><small>{Math.round(base).toLocaleString("es-MX")}</small><small>{Math.round(boost || base).toLocaleString("es-MX")}</small><small>+</small></div>
    </div>
  );
}

function MiniHistory({ points, dual = false }: { points: TelemetryPoint[]; dual?: boolean }) {
  const data = points.length ? points : Array.from({ length: 18 }, (_, index) => ({ cpu: 10 + index % 5, gpu: 7 + index % 4, vram: 20 }));
  return (
    <div className={dual ? "mini-history dual" : "mini-history"} aria-label={dual ? "Historial de GPU y VRAM de los últimos 36 segundos" : "Historial de CPU de los últimos 36 segundos"}>
      {data.map((point, index) => <span key={index}><i style={{ height: `${Math.max(2, dual ? point.gpu : point.cpu)}%` }} />{dual && <b style={{ height: `${Math.max(2, point.vram)}%` }} />}</span>)}
    </div>
  );
}

function CpuPerformanceCard({ metrics, history, status, preference, editing, onPreference, onOpen }: {
  metrics: Metrics;
  history: TelemetryPoint[];
  status: Status;
  preference: ModulePreference;
  editing: boolean;
  onPreference: (patch: Partial<ModulePreference>) => void;
  onOpen: () => void;
}) {
  return (
    <article className={`module black metric-card performance-card cpu-performance status-surface density-${preference.density}`} data-status={status} data-hardware="cpu" style={{ "--module-span": moduleSpan[preference.size] } as CSSProperties}>
      <div className="metric-head"><span>SYS/CPU-01 · 1S</span><StatusTag status={status} label={statusLabels[status]} /></div>
      {editing && <ModuleEditorControls preference={preference} onChange={onPreference} />}
      <div className="performance-summary"><div><strong>{Math.round(metrics.cpu)}</strong><span>%</span></div><p><b>{metrics.cpuName}</b><small>{metrics.cpuCores} NÚCLEOS · {metrics.cpuThreads} HILOS</small></p></div>
      <MiniHistory points={history} />
      {preference.density !== "essential" && <ClockBand label="RELOJ CPU" current={metrics.cpuClock} base={metrics.cpuBaseClock} boost={metrics.cpuBoostClock} state={metrics.cpuClockState} />}
      {preference.density === "technical" && <small className="reference-source">REFERENCIA: {metrics.cpuReferenceSource}</small>}
      <OpenPanelButton onOpen={onOpen} />
    </article>
  );
}

function GpuPerformanceCard({ metrics, history, status, preference, editing, onPreference, onOpen }: {
  metrics: Metrics;
  history: TelemetryPoint[];
  status: Status;
  preference: ModulePreference;
  editing: boolean;
  onPreference: (patch: Partial<ModulePreference>) => void;
  onOpen: () => void;
}) {
  return (
    <article className={`module black metric-card performance-card gpu-performance status-surface density-${preference.density}`} data-status={status} data-hardware="gpu" style={{ "--module-span": moduleSpan[preference.size] } as CSSProperties}>
      <div className="metric-head"><span>SYS/GPU-02 · 1S</span><StatusTag status={status} label={statusLabels[status]} /></div>
      {editing && <ModuleEditorControls preference={preference} onChange={onPreference} />}
      <div className="performance-summary"><div><strong>{Math.round(metrics.gpu)}</strong><span>%</span></div><p><b>{metrics.gpuName}</b><small>{metrics.gpuTemp.toFixed(0)}°C · {metrics.gpuPower.toFixed(0)}/{metrics.gpuPowerLimit.toFixed(0)} W · {metrics.gpuPstate}</small></p></div>
      <div className="history-legend"><span><i />GPU</span><span><i />VRAM {metrics.vram.toFixed(0)}%</span></div>
      <MiniHistory points={history} dual />
      {preference.density !== "essential" && <div className="vram-owner"><span>MAYOR USO DE VRAM</span><b>{metrics.vramTopProcess.name}</b><small>{metrics.vramTopProcess.pid ? `PID ${metrics.vramTopProcess.pid} · ` : ""}{metrics.vramTopProcess.used.toFixed(0)} MB · {metrics.vramUsed.toFixed(1)}/{metrics.vramTotal.toFixed(1)} GB</small></div>}
      {preference.density !== "essential" && <ClockBand label="NÚCLEO GPU" current={metrics.gpuCoreClock} base={metrics.gpuCoreBaseClock} boost={metrics.gpuCoreBoostClock} state={metrics.gpuClockState} offset={metrics.gpuManualCoreOffset} />}
      {preference.density === "technical" && <ClockBand label="MEMORIA / VRAM" current={metrics.gpuMemoryClock} base={metrics.gpuMemoryStockClock} boost={metrics.gpuMemoryStockClock} state={metrics.gpuMemoryClockState} offset={metrics.gpuManualMemoryOffset} />}
      {preference.density === "technical" && <small className="reference-source">{metrics.gpuManualOcDetected ? `OC: ${metrics.gpuManualOcSource} · ` : ""}REFERENCIA: {metrics.gpuReferenceSource}</small>}
      <OpenPanelButton onOpen={onOpen} />
    </article>
  );
}

function PcHardwareMap({ metrics, statuses, onSelect }: { metrics: Metrics; statuses: Record<HardwareKind, Status>; onSelect: (kind: HardwareKind) => void }) {
  const parts: { kind: HardwareKind; label: string; value: string; detail: string }[] = [
    { kind: "cpu", label: "CPU", value: `${metrics.cpu.toFixed(0)}%`, detail: `${metrics.cpuClock.toLocaleString("es-MX")} MHz` },
    { kind: "gpu", label: "GPU", value: `${metrics.gpu.toFixed(0)}%`, detail: `${metrics.gpuTemp.toFixed(0)}°C · VRAM ${metrics.vram.toFixed(0)}%` },
    { kind: "memory", label: "RAM", value: `${metrics.memory.toFixed(0)}%`, detail: `${metrics.memoryUsed.toFixed(1)}/${metrics.memoryTotal.toFixed(1)} GB` },
    { kind: "disk", label: "SSD", value: `${metrics.disk.toFixed(0)}%`, detail: `${metrics.write.toFixed(1)} MB/s` },
  ];
  return (
    <div className="pc-map-shell module black">
      <div className="pc-chassis" role="group" aria-label="Diagrama interactivo de la PC">
        <Image className="pc-diagram-image" src="/pc-diagram-v0.6.png" alt="" fill sizes="(max-width: 900px) 100vw, 65vw" priority unoptimized />
        <div className="pc-diagram-grid" aria-hidden="true" />
        <div className="board-label">REEBOT / PHYSICAL MAP · 0.6</div>
        {parts.map((part) => (
          <button key={part.kind} className={`pc-hotspot ${part.kind}-hotspot`} data-hardware={part.kind} data-status={statuses[part.kind]} onClick={() => onSelect(part.kind)} aria-label={`Abrir panel de ${part.label}: ${part.value}`}>
            <span><i />{part.label}</span><b>{part.value}</b>
          </button>
        ))}
      </div>
      <div className="pc-map-copy">
        <p className="eyebrow">TU EQUIPO, EXPLICADO POR PARTES</p>
        <h2>Toca lo que quieras entender.</h2>
        <p>Cada componente tiene su propio color y panel completo. REEBI conserva el contexto para explicarte qué ocurre, no sólo mostrar números.</p>
        <div className="hardware-legend">
          {parts.map((part) => <button key={part.kind} data-hardware={part.kind} onClick={() => onSelect(part.kind)}><i /><span><b>{part.label}</b><small>{part.detail}</small></span><strong>{part.value}</strong></button>)}
        </div>
      </div>
    </div>
  );
}

function HardwareDetailPanel({ kind, metrics, history, status, onClose }: { kind: HardwareKind; metrics: Metrics; history: TelemetryPoint[]; status: Status; onClose: () => void }) {
  const labels: Record<HardwareKind, { code: string; title: string }> = {
    cpu: { code: "SYS/CPU-01", title: "Procesador" },
    gpu: { code: "SYS/GPU-02", title: "Gráficos y VRAM" },
    memory: { code: "SYS/RAM-03", title: "Memoria RAM" },
    disk: { code: "STO/DSK-04", title: "Almacenamiento" },
  };
  const ramProcesses = [...metrics.processes].sort((a, b) => b.ram - a.ram).slice(0, 5);
  const closeFromBackdrop = (event: ReactPointerEvent<HTMLDivElement>) => { if (event.currentTarget === event.target) onClose(); };
  return (
    <div className="hardware-detail-backdrop" onPointerDown={closeFromBackdrop}>
      <section className="hardware-detail-panel status-surface" data-hardware={kind} data-status={status} role="dialog" aria-modal="true" aria-labelledby="hardware-detail-title">
        <header><div><span>{labels[kind].code} · REFRESCO 1S</span><StatusTag status={status} label={statusLabels[status]} /></div><button onClick={onClose} aria-label="Cerrar panel">CERRAR ×</button></header>
        <div className="detail-title"><p className="eyebrow">PANEL COMPLETO</p><h2 id="hardware-detail-title">{labels[kind].title}</h2></div>
        {kind === "cpu" && <div className="detail-performance">
          <div className="detail-hero-value"><strong>{metrics.cpu.toFixed(0)}</strong><span>%</span><p><b>{metrics.cpuName}</b><small>{metrics.cpuCores} núcleos · {metrics.cpuThreads} hilos · {metrics.cpuClock.toLocaleString("es-MX")} MHz</small></p></div>
          <MiniHistory points={history} />
          <ClockBand label="RELOJ CPU" current={metrics.cpuClock} base={metrics.cpuBaseClock} boost={metrics.cpuBoostClock} state={metrics.cpuClockState} />
          <div className="detail-facts"><span><small>BASE</small><b>{metrics.cpuBaseClock.toLocaleString("es-MX")} MHz</b></span><span><small>BOOST REF.</small><b>{metrics.cpuBoostClock.toLocaleString("es-MX")} MHz</b></span><span><small>FUENTE</small><b>{metrics.cpuReferenceSource}</b></span></div>
        </div>}
        {kind === "gpu" && <div className="detail-performance">
          <div className="detail-hero-value"><strong>{metrics.gpu.toFixed(0)}</strong><span>%</span><p><b>{metrics.gpuName}</b><small>{metrics.gpuTemp.toFixed(0)}°C · {metrics.gpuPower.toFixed(0)}/{metrics.gpuPowerLimit.toFixed(0)} W · {metrics.gpuPstate}</small></p></div>
          <div className="history-legend"><span><i />GPU</span><span><i />VRAM {metrics.vram.toFixed(0)}%</span></div><MiniHistory points={history} dual />
          <div className="vram-owner"><span>MAYOR USO DE VRAM</span><b>{metrics.vramTopProcess.name}</b><small>{metrics.vramTopProcess.used.toFixed(0)} MB · {metrics.vramUsed.toFixed(1)}/{metrics.vramTotal.toFixed(1)} GB</small></div>
          <ClockBand label="NÚCLEO GPU" current={metrics.gpuCoreClock} base={metrics.gpuCoreBaseClock} boost={metrics.gpuCoreBoostClock} state={metrics.gpuClockState} offset={metrics.gpuManualCoreOffset} />
          <ClockBand label="MEMORIA / VRAM" current={metrics.gpuMemoryClock} base={metrics.gpuMemoryStockClock} boost={metrics.gpuMemoryStockClock} state={metrics.gpuMemoryClockState} offset={metrics.gpuManualMemoryOffset} />
          <div className="detail-facts"><span><small>AFINACIÓN GPU</small><b>{metrics.gpuManualOcDetected ? `+${metrics.gpuManualCoreOffset} MHz` : "SIN OC DETECTADO"}</b></span><span><small>AFINACIÓN VRAM</small><b>{metrics.gpuManualOcDetected ? `+${metrics.gpuManualMemoryOffset} MHz` : "SIN OC DETECTADO"}</b></span><span><small>FUENTE</small><b>{metrics.gpuManualOcSource || metrics.gpuReferenceSource}</b></span></div>
        </div>}
        {kind === "memory" && <div className="detail-performance">
          <div className="detail-hero-value"><strong>{metrics.memory.toFixed(0)}</strong><span>%</span><p><b>{metrics.memoryUsed.toFixed(1)} GB en uso</b><small>{metrics.memoryTotal.toFixed(1)} GB instalados · {(metrics.memoryTotal - metrics.memoryUsed).toFixed(1)} GB disponibles</small></p></div>
          <div className="detail-meter"><i style={{ width: `${Math.min(100, metrics.memory)}%` }} /></div>
          <div className="detail-processes"><span>PROCESOS CON MAYOR USO DE RAM</span>{ramProcesses.map((process) => <div key={process.pid}><b>{process.name}</b><small>PID {process.pid}</small><strong>{process.ram.toFixed(0)} MB</strong></div>)}</div>
        </div>}
        {kind === "disk" && <div className="detail-performance">
          <div className="detail-hero-value"><strong>{metrics.disk.toFixed(0)}</strong><span>%</span><p><b>{metrics.diskName}</b><small>{metrics.diskFree.toFixed(0)} GB libres · actividad en tiempo real</small></p></div>
          <div className="detail-meter"><i style={{ width: `${Math.min(100, metrics.disk)}%` }} /></div>
          <div className="detail-facts"><span><small>LECTURA</small><b>{metrics.read.toFixed(1)} MB/s</b></span><span><small>ESCRITURA</small><b>{metrics.write.toFixed(1)} MB/s</b></span><span><small>ESPACIO LIBRE</small><b>{metrics.diskFree.toFixed(0)} GB</b></span></div>
        </div>}
      </section>
    </div>
  );
}

function NoticeCard({ notice, onNavigate }: { notice: Notice; onNavigate: (view: View) => void }) {
  return (
    <article className="notice-card status-surface" data-status={notice.status}>
      <div className="notice-symbol" aria-hidden="true">{notice.symbol}</div>
      <div><StatusTag status={notice.status} label={statusLabels[notice.status]} /><h3>{notice.title}</h3><p>{notice.copy}</p></div>
      {notice.action && <button onClick={() => onNavigate(notice.action?.view || "inicio")}>{notice.action.label} ↗</button>}
    </article>
  );
}

function ConversationView({ aiState, aiLabel, question, reply, thinking, setQuestion, ask }: { aiState: AiState; aiLabel: string; question: string; reply: string; thinking: boolean; setQuestion: (value: string) => void; ask: (override?: string) => Promise<void> }) {
  return (
    <section className="module black full-view status-surface" data-status={thinking ? "active" : "special"}>
      <ModuleTop code="REEBI/CONVERSATION-02" status={thinking ? "active" : "special"} label={thinking ? "ANALIZANDO" : "LISTA PARA ESCUCHAR"} />
      <div className={`ai-badge dark ${aiState.engine}`} title={aiState.reason}><i />{aiLabel}</div>
      <h1>Habla con tu PC.</h1><p>Pregunta por procesos, archivos o rendimiento. REEBI responderá sólo con las métricas que realmente puede ver.</p>
      <div className="prompt-chips">{suggestedQuestions.map((prompt) => <button key={prompt} onClick={() => void ask(prompt)} disabled={thinking}>{prompt}</button>)}</div>
      <div className="full-chat"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void ask(); }} placeholder="¿Qué te está pasando?" aria-label="Pregunta para REEBI" /><button disabled={thinking} onClick={() => void ask()}>{thinking ? "ANALIZANDO..." : "PREGUNTAR"}</button></div>
      <div className="assistant-reply"><div><b>REEBI</b><small>{aiState.engine === "ollama" ? "MODELO LOCAL" : "MOTOR BÁSICO"}</small></div><p className={thinking ? "assistant-message thinking" : "assistant-message"} aria-live="polite">{reply}</p></div>
    </section>
  );
}

function LabView({ diskStatus: currentDiskStatus }: { diskStatus: Status }) {
  return (
    <section className="module black full-view status-surface" data-status="special">
      <ModuleTop code="LAB/EXPERIMENTS-03" status="special" label="ENTORNO SEGURO" />
      <h1>Experimentos guiados.</h1><p>Cada prueba mide antes y después, explica el resultado y pide permiso antes de tocar algo.</p>
      <div className="lab-list"><LabEntry index="#001" title="SSD 1TB" detail="Pendiente · velocidad y capacidad real" status={currentDiskStatus === "warning" ? "warning" : "special"} /><LabEntry index="#000" title="Transferencia de juego" detail="Observado · actividad de escritura" status="neutral" /></div>
    </section>
  );
}

function ProcessesView({ metrics, memoryStatusValue, bridgeConnected, bridgeToken, profile, experience }: {
  metrics: Metrics;
  memoryStatusValue: Status;
  bridgeConnected: boolean;
  bridgeToken: string;
  profile: keyof typeof profiles;
  experience: Experience;
}) {
  const [recommendations, setRecommendations] = useState<OptimizationRecommendation[]>([]);
  const [scanState, setScanState] = useState<"idle" | "scanning" | "ready" | "error">("idle");
  const [scanMessage, setScanMessage] = useState("REEBI todavía no ha evaluado qué conviene cambiar.");
  const [scanEngine, setScanEngine] = useState<"ollama" | "rules" | null>(null);
  const [pending, setPending] = useState<OptimizationRecommendation | null>(null);
  const [applying, setApplying] = useState(false);
  const [actionResult, setActionResult] = useState<{ message: string; undoToken?: string; status: "success" | "error" } | null>(null);

  const scan = async () => {
    if (!bridgeConnected || scanState === "scanning") return;
    setScanState("scanning");
    setScanMessage("REEBI está comparando consumo, prioridad y seguridad de cada proceso...");
    setActionResult(null);
    try {
      const response = await fetch(`${BRIDGE_URL}/optimization/scan`, {
        method: "POST",
        mode: "cors",
        headers: bridgeHeaders(bridgeToken, true),
        body: JSON.stringify({ profile, experience }),
      });
      const payload = (await response.json()) as OptimizationScan;
      if (!response.ok) throw new Error(payload.error || "No pude analizar los procesos.");
      setRecommendations(payload.recommendations || []);
      setScanEngine(payload.engine || "rules");
      setScanMessage(payload.message || "Análisis terminado.");
      setScanState("ready");
    } catch (error) {
      setRecommendations([]);
      setScanState("error");
      setScanMessage(error instanceof Error ? error.message : "No pude analizar los procesos.");
    }
  };

  const execute = async () => {
    if (!pending || applying) return;
    setApplying(true);
    try {
      const response = await fetch(`${BRIDGE_URL}/actions/execute`, {
        method: "POST",
        mode: "cors",
        headers: bridgeHeaders(bridgeToken, true),
        body: JSON.stringify({ planId: pending.planId, confirmation: "CONFIRMADO_POR_USUARIO" }),
      });
      const payload = (await response.json()) as OptimizationActionResult;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Windows rechazó el cambio.");
      setRecommendations((current) => current.filter((item) => item.planId !== pending.planId));
      setActionResult({ message: payload.message || "Cambio aplicado.", undoToken: payload.undoToken, status: "success" });
      setPending(null);
    } catch (error) {
      setActionResult({ message: error instanceof Error ? error.message : "No pude aplicar el cambio.", status: "error" });
      setPending(null);
    } finally {
      setApplying(false);
    }
  };

  const undo = async () => {
    if (!actionResult?.undoToken || applying) return;
    setApplying(true);
    try {
      const response = await fetch(`${BRIDGE_URL}/actions/undo`, {
        method: "POST",
        mode: "cors",
        headers: bridgeHeaders(bridgeToken, true),
        body: JSON.stringify({ undoToken: actionResult.undoToken }),
      });
      const payload = (await response.json()) as OptimizationActionResult;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "No pude deshacer el cambio.");
      setActionResult({ message: payload.message || "Cambio deshecho.", status: "success" });
    } catch (error) {
      setActionResult({ message: error instanceof Error ? error.message : "No pude deshacer el cambio.", status: "error" });
    } finally {
      setApplying(false);
    }
  };

  return (
    <section className="module black full-view status-surface" data-status={memoryStatusValue}>
      <ModuleTop code="SYS/PROCESSES-04" status={memoryStatusValue} label={statusLabels[memoryStatusValue]} />
      <div className="process-intro"><div><h1>¿Quién usa mis recursos?</h1><p>REEBI puede proponer cambios reales y reversibles. Un nombre desconocido no significa automáticamente que sea un virus.</p></div><button disabled={!bridgeConnected || scanState === "scanning"} onClick={() => void scan()}>{scanState === "scanning" ? "ANALIZANDO..." : "ANALIZAR CON REEBI"}</button></div>
      <div className="optimization-status" data-state={scanState}><span>{scanEngine === "ollama" ? "IA LOCAL" : scanEngine === "rules" ? "MOTOR SEGURO" : "CONTROL LOCAL"}</span><p>{bridgeConnected ? scanMessage : "Abre la app local y conecta el agente para permitir optimizaciones."}</p></div>
      {actionResult && <div className="action-result" data-status={actionResult.status}><p>{actionResult.message}</p>{actionResult.undoToken && <button disabled={applying} onClick={() => void undo()}>{applying ? "DESHACIENDO..." : "DESHACER"}</button>}</div>}
      {recommendations.length > 0 && <div className="optimization-list">{recommendations.map((recommendation) => <article className="optimization-card" key={recommendation.planId} data-risk={recommendation.risk}><div className="optimization-card-head"><span>PID {recommendation.pid} · RIESGO {recommendation.risk.toUpperCase()}</span><b>{recommendation.actionLabel}</b></div><h2>{recommendation.summary}</h2><p>{recommendation.reason}</p><small>{recommendation.benefit}</small><div className="optimization-metrics"><span>CPU {recommendation.cpu.toFixed(1)}%</span><span>RAM {recommendation.ram.toFixed(0)} MB</span><span>{recommendation.company || "EDITOR NO IDENTIFICADO"}</span></div><button onClick={() => setPending(recommendation)}>REVISAR CAMBIO</button></article>)}</div>}
      <div className="process-table"><div className="process-row heading"><span>PROCESO</span><span>CPU</span><span>RAM</span><span>ESTADO</span></div>{metrics.processes.map((process) => <div className="process-row" key={process.pid}><span><b>{process.name}</b><small>{process.company || `PID ${process.pid}`}</small></span><span>{process.cpu.toFixed(1)}%</span><span>{process.ram.toFixed(0)} MB</span><span className={process.canOptimize ? "process-changeable" : "process-protected"}>{process.paused ? "PAUSADO" : process.canOptimize ? process.priority || "AJUSTABLE" : "PROTEGIDO"}</span></div>)}</div>
      {pending && <div className="action-dialog-backdrop" role="presentation"><div className="action-dialog" role="dialog" aria-modal="true" aria-labelledby="action-dialog-title"><span>PERMISO NECESARIO</span><h2 id="action-dialog-title">{pending.actionLabel}: {pending.name}</h2><p>{pending.action === "pause_5m" ? "La aplicación quedará congelada hasta cinco minutos. Puede interrumpir una descarga, llamada o tarea que siga activa." : "Windows dará menos tiempo de CPU a este proceso cuando otras aplicaciones lo necesiten. No se cerrará ni perderá archivos."}</p><div><button disabled={applying} onClick={() => setPending(null)}>CANCELAR</button><button className="confirm" disabled={applying} onClick={() => void execute()}>{applying ? "APLICANDO..." : "CONFIRMAR CAMBIO"}</button></div></div></div>}
    </section>
  );
}

function SettingsView({ experience, setExperience, aiLabel, aiState, bridge, pairCode, setPairCode, localPairCode, pairError, onPair, onRetry, onDisconnect }: {
  experience: Experience;
  setExperience: (experience: Experience) => void;
  aiLabel: string;
  aiState: AiState;
  bridge: BridgeState;
  pairCode: string;
  setPairCode: (code: string) => void;
  localPairCode: string | null;
  pairError: string;
  onPair: () => Promise<void>;
  onRetry: () => void;
  onDisconnect: () => Promise<void>;
}) {
  const bridgeStatus: Status = bridge.phase === "connected" ? "healthy" : bridge.phase === "pairing" ? "warning" : bridge.phase === "checking" ? "active" : "neutral";
  const bridgeLabel = bridge.phase === "connected" ? "PC VINCULADA" : bridge.phase === "pairing" ? "CÓDIGO NECESARIO" : bridge.phase === "checking" ? "BUSCANDO" : "AGENTE DESCONECTADO";
  return (
    <section className="module black full-view status-surface" data-status="neutral">
      <ModuleTop code="REEBI/PREFERENCES-05" status="neutral" label="CONTROL DEL USUARIO" />
      <h1>Tu Reebot, tus reglas.</h1><p>Personaliza cómo se comunica REEBI. Ningún ajuste del sistema se modifica sin tu permiso.</p>
      <div className="bridge-panel status-surface" data-status={bridgeStatus}>
        <div className="bridge-copy"><span>BRIDGE/LOCAL-01</span><StatusTag status={bridgeStatus} label={bridgeLabel} /><h2>Conecta esta página con tu PC.</h2><p>{bridge.reason} El acceso queda limitado a REEBOT LAB y puedes revocarlo cuando quieras.</p></div>
        {localPairCode ? <div className="pair-code"><small>CÓDIGO PARA LA VERSIÓN PUBLICADA</small><strong>{localPairCode}</strong><p>Abre la página publicada, entra a Ajustes y escribe este código.</p></div> : bridge.phase === "connected" ? <div className="bridge-action"><small>AGENTE {bridge.version || "LOCAL"}</small><b>{bridge.model || "TELEMETRÍA ACTIVA"}</b><button onClick={() => void onDisconnect()}>DESVINCULAR</button></div> : bridge.phase === "pairing" ? <div className="pair-form"><label htmlFor="pair-code">CÓDIGO DE SEIS DÍGITOS</label><div><input id="pair-code" value={pairCode} onChange={(event) => setPairCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" /><button disabled={pairCode.length !== 6 || bridge.phase === "checking"} onClick={() => void onPair()}>VINCULAR</button></div>{pairError && <p role="alert">{pairError}</p>}</div> : <div className="bridge-action"><small>PASO 01</small><b>ABRE START_REEBOT_AGENT.cmd</b><button onClick={onRetry}>{bridge.phase === "checking" ? "BUSCANDO..." : "VOLVER A PROBAR"}</button></div>}
      </div>
      <div className="settings-grid"><label>NOMBRE DE LA PC<input defaultValue="Nébula" /></label><label>EXPERIENCIA<select value={experience} onChange={(event) => setExperience(event.target.value as Experience)}><option value="nuevo">Es mi primera PC</option><option value="intermedio">Tengo algo de técnico</option><option value="experto">Conozco bien mi PC</option></select></label><label>CONSUMO VISUAL<select defaultValue="visual"><option value="ahorro">Ahorro</option><option value="normal">Normal</option><option value="visual">Visual</option></select></label><label>MOTOR DE IA<input readOnly value={aiLabel} /></label></div>
      <p className="settings-note">{aiState.reason} REEBI sólo puede aplicar acciones permitidas desde la app local, después de mostrar el impacto y recibir tu confirmación.</p>
    </section>
  );
}

function LabEntry({ index, title, detail, status }: { index: string; title: string; detail: string; status: Status }) {
  return <div className="lab-entry" data-status={status}><span>{index}</span><div><b>{title}</b><p>{detail}</p></div><StatusTag status={status} label={statusLabels[status]} /><button>ABRIR</button></div>;
}
