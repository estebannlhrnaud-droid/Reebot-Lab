"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type Process = { name: string; pid: number; cpu: number; ram: number };
type Metrics = {
  cpu: number;
  memory: number;
  gpu: number;
  gpuTemp: number;
  vram: number;
  vramUsed: number;
  vramTotal: number;
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
type Status = "neutral" | "healthy" | "active" | "warning" | "critical" | "special";
type ChatMessage = { role: "user" | "assistant"; content: string };
type AiState = { engine: "checking" | "ollama" | "basic"; model: string | null; reason: string };
type AiReply = { reply?: string; engine?: "ollama" | "basic"; model?: string | null; reason?: string; error?: string };
type Notice = { status: Status; symbol: string; title: string; copy: string; action?: { label: string; view: View } };

const fallback: Metrics = {
  cpu: 18,
  memory: 56,
  gpu: 8,
  gpuTemp: 41,
  vram: 22,
  vramUsed: 1.8,
  vramTotal: 8,
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

const profiles = {
  Gaming: { copy: "Priorizo una sesión fluida y vigilo memoria, temperatura y carga.", mood: "focused" as MascotMood },
  Estudio: { copy: "Mantengo tus herramientas disponibles sin gastar recursos de más.", mood: "calm" as MascotMood },
  Chill: { copy: "Bajo el ritmo, reduzco el ruido y observo sólo lo importante.", mood: "calm" as MascotMood },
  Movie: { copy: "Cuido una reproducción estable y sin interrupciones.", mood: "focused" as MascotMood },
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
  const [mode, setMode] = useState<keyof typeof profiles>("Estudio");
  const [experience, setExperience] = useState<Experience>("intermedio");
  const [mascotMood, setMascotMood] = useState<MascotMood>("calm");
  const [mascotTouched, setMascotTouched] = useState(false);
  const [mascotReaction, setMascotReaction] = useState(0);
  const [metrics, setMetrics] = useState<Metrics>(fallback);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [question, setQuestion] = useState("¿Por qué estabas lenta hace rato?");
  const [reply, setReply] = useState("Estoy escuchando.");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [aiState, setAiState] = useState<AiState>({ engine: "checking", model: null, reason: "Buscando un motor de IA local." });

  useEffect(() => {
    if (paused) return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch("http://127.0.0.1:47831/metrics", { cache: "no-store" });
        const payload = (await response.json()) as Metrics;
        if (active) {
          setMetrics(payload);
          setConnected(true);
        }
      } catch {
        if (active) setConnected(false);
      }
    };
    void poll();
    const timer = window.setInterval(poll, 8000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [paused]);

  useEffect(() => {
    let active = true;
    const detectAi = async () => {
      try {
        const response = await fetch("/api/ai/status", { cache: "no-store" });
        const payload = (await response.json()) as { engine?: "ollama" | "basic"; model?: string | null; reason?: string };
        if (active) setAiState({ engine: payload.engine || "basic", model: payload.model || null, reason: payload.reason || "Motor local no disponible." });
      } catch {
        if (active) setAiState({ engine: "basic", model: null, reason: "No pude consultar el motor local; usaré el análisis básico." });
      }
    };
    void detectAi();
    return () => {
      active = false;
    };
  }, []);

  const statuses = useMemo(
    () => ({
      cpu: cpuStatus(metrics.cpu, connected),
      gpu: gpuStatus(metrics.gpu, metrics.gpuTemp, connected),
      memory: memoryStatus(metrics.memory, connected),
      disk: diskStatus(metrics.disk, connected),
    }),
    [connected, metrics],
  );

  const systemStatus = useMemo<Status>(() => {
    const values = Object.values(statuses);
    if (values.includes("critical")) return "critical";
    if (values.includes("warning")) return "warning";
    if (!connected) return "neutral";
    if (values.includes("active")) return "active";
    return "healthy";
  }, [connected, statuses]);

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
        : connected
          ? "healthy"
          : "neutral";

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
    if (!connected) return "Estoy lista. Conecta la telemetría para verme trabajar.";
    return "Todo está tranquilo.";
  }, [connected, mascotMood, mascotTouched, statuses, systemStatus, thinking]);

  const notices = useMemo<Notice[]>(() => {
    const items: Notice[] = [];
    if (!connected) {
      items.push({ status: "neutral", symbol: "○", title: "TELEMETRÍA EN ESPERA", copy: "La interfaz usa datos de demostración hasta reconectar el monitor local." });
    }
    if (thinking) {
      items.push({ status: "active", symbol: "⌁", title: "REE ESTÁ ANALIZANDO", copy: "Está comparando actividad, temperatura y procesos antes de responder." });
    }
    if (statuses.gpu === "critical") {
      items.push({ status: "critical", symbol: "!", title: "TEMPERATURA CRÍTICA", copy: "Conviene detener la carga y revisar ventilación.", action: { label: "PREGUNTAR A REE", view: "chat" } });
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
      items.push({ status: "special", symbol: "✦", title: "IA LOCAL LISTA", copy: "REE puede interpretar lo que ocurre sin enviar tus métricas a la nube.", action: { label: "CONVERSAR", view: "chat" } });
    }
    return items.slice(0, 2);
  }, [aiState.engine, connected, statuses, thinking]);

  const ask = async (override?: string) => {
    const message = (override || question).trim();
    if (!message || thinking) return;
    setQuestion(message);
    setThinking(true);
    setMascotMood("focused");
    setMascotTouched(false);
    setReply("Estoy cruzando tu pregunta con las métricas actuales...");
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: history.slice(-8), metrics, profile: mode, experience }),
      });
      const payload = (await response.json()) as AiReply;
      if (!response.ok || !payload.reply) throw new Error(payload.error || "La IA local no respondió.");
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

  const cycleMascotMood = () => {
    setMascotTouched(true);
    setMascotReaction((value) => value + 1);
    setMascotMood((current) => (current === "calm" ? "focused" : current === "focused" ? "playful" : "calm"));
  };

  const moveMascot = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    event.currentTarget.style.setProperty("--pointer-x", x.toFixed(2));
    event.currentTarget.style.setProperty("--pointer-y", y.toFixed(2));
  };

  const resetMascot = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.style.setProperty("--pointer-x", "0");
    event.currentTarget.style.setProperty("--pointer-y", "0");
  };

  const openConversation = (prompt?: string) => {
    if (prompt) setQuestion(prompt);
    setView("chat");
  };

  return (
    <main className="app-shell" data-mood={mascotMood}>
      <header className="brand-header">
        <div className="brand-lockup" aria-label="REEBOT LAB">
          <span className="brand-reebot">REEBOT</span>
          <span className="brand-lab">LAB</span>
          <span className="brand-star" aria-hidden="true"><i />✦<i /></span>
        </div>
        <div className="brand-meta"><span>PERSONAL COMPUTER COMPANION</span><b>EARLY ACCESS / 00.1</b></div>
      </header>

      <div className="workspace">
        <nav className="side-rail" aria-label="Navegación principal">
          {views.map((item, index) => (
            <button key={item.id} className={view === item.id ? "rail-item active" : "rail-item"} onClick={() => setView(item.id)} aria-current={view === item.id ? "page" : undefined}>
              <span>{String(index + 1).padStart(2, "0")}</span><b>{item.label}</b>
            </button>
          ))}
          <div className="rail-status" data-status={connected ? "healthy" : "neutral"}><i />{connected ? "EN VIVO" : "DEMO"}</div>
        </nav>

        <section className="content-area">
          <div className="content-topline">
            <span>{labels[view]}</span>
            <div><span className="analysis-dot" data-status={paused ? "neutral" : thinking ? "active" : connected ? "healthy" : "neutral"} />{paused ? "MONITOREO EN PAUSA" : "ANALIZANDO EN TIEMPO REAL"}<button onClick={() => setPaused((value) => !value)}>{paused ? "REANUDAR" : "PAUSAR"}</button></div>
          </div>

          {view === "inicio" && (
            <div className="home-flow">
              <section className="hero-grid" aria-label="Estado general y REE">
                <article className="module black system-overview status-surface" data-status={systemStatus}>
                  <ModuleTop code="SYS/OVERVIEW-00" status={systemStatus} label={statusLabels[systemStatus]} />
                  <div className="overview-copy">
                    <p className="eyebrow">ESTADO GENERAL DE NÉBULA</p>
                    <h1>{systemHeadline}</h1>
                    <p>{profiles[mode].copy} {connected ? "Estoy leyendo tu equipo en tiempo real." : "Ahora mismo trabajo con una simulación segura."}</p>
                  </div>
                  <div className="profile-row"><span>MODO PREFERIDO</span><div>{(Object.keys(profiles) as (keyof typeof profiles)[]).map((profile) => <button key={profile} className={mode === profile ? "active" : ""} onClick={() => chooseMode(profile)}>{profile}</button>)}</div></div>
                </article>

                <article className="mascot-card status-surface" data-status={reeStatus} data-reaction={mascotReaction % 2}>
                  <div className="mascot-top"><span>REE / ID-001</span><StatusTag status={reeStatus} label={thinking ? "ANALIZANDO" : statusLabels[reeStatus]} /></div>
                  <div className="construction-mark mark-a" aria-hidden="true" /><div className="construction-mark mark-b" aria-hidden="true" />
                  <div className="mascot-glow" aria-hidden="true" />
                  <div className="mascot-speech" role="status" aria-live="polite"><span>REE DICE</span><p>{reeMessage}</p><button onClick={() => openConversation("¿Qué estás viendo en mi PC?")}>HABLAR CON REE ↗</button></div>
                  <button className="mascot-button" onClick={cycleMascotMood} onPointerMove={moveMascot} onPointerLeave={resetMascot} aria-label="Interactuar con REE">
                    <Image className="mascot-image" src="/reebot-mascot.png" alt="" width={1254} height={1254} priority unoptimized />
                  </button>
                  <div className="mascot-caption">TOCA A REE PARA INTERACTUAR</div>
                </article>
              </section>

              <section className="metric-grid" aria-label="Métricas principales">
                <MetricCard code="SYS/CPU-01" label="CPU" value={metrics.cpu} status={statuses.cpu} description={metricDescription("cpu", statuses.cpu)} meta="RYZEN 7 5700G" />
                <MetricCard code="SYS/GPU-02" label="GPU" value={metrics.gpu} status={statuses.gpu} description={metricDescription("gpu", statuses.gpu)} meta={`${metrics.gpuTemp.toFixed(0)}°C · ${metrics.vramUsed.toFixed(1)}/${metrics.vramTotal.toFixed(1)} GB VRAM`} />
                <MetricCard code="SYS/RAM-03" label="RAM" value={metrics.memory} status={statuses.memory} description={metricDescription("memory", statuses.memory)} meta={`${metrics.memoryUsed.toFixed(1)}/${metrics.memoryTotal.toFixed(1)} GB`} />
                <MetricCard code="STO/DSK-04" label="DISCO E:" value={metrics.disk} status={statuses.disk} description={metricDescription("disk", statuses.disk)} meta={`${metrics.write.toFixed(1)} MB/S ESCRITURA`} />
              </section>

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
                  <div className="module-top"><span>REE/CHAT-02</span><div className={`ai-badge ${aiState.engine}`} title={aiState.reason}><i />{aiLabel}</div></div>
                  <div><p className="eyebrow">CONVERSACIÓN DIRECTA</p><h2>Pregúntale algo a tu PC.</h2></div>
                  <div className="quick-chat"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void ask(); }} aria-label="Pregunta para REE" /><button disabled={thinking} onClick={() => void ask()}>{thinking ? "PENSANDO" : "ENVIAR ↗"}</button></div>
                  <p className={thinking ? "assistant-message thinking" : "assistant-message"} aria-live="polite">{reply}</p>
                </article>
              </section>
            </div>
          )}

          {view === "chat" && <ConversationView aiState={aiState} aiLabel={aiLabel} question={question} reply={reply} thinking={thinking} setQuestion={setQuestion} ask={ask} />}
          {view === "lab" && <LabView diskStatus={statuses.disk} />}
          {view === "procesos" && <ProcessesView metrics={metrics} memoryStatusValue={statuses.memory} />}
          {view === "ajustes" && <SettingsView experience={experience} setExperience={setExperience} aiLabel={aiLabel} aiState={aiState} />}
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

function MetricCard({ code, label, value, status, description, meta }: { code: string; label: string; value: number; status: Status; description: string; meta: string }) {
  return (
    <article className="module black metric-card status-surface" data-status={status} aria-label={`${label}: ${Math.round(value)} por ciento, ${statusLabels[status]}`}>
      <div className="metric-head"><span>{code}</span><StatusTag status={status} label={statusLabels[status]} /></div>
      <div className="metric-value"><strong>{Math.round(value)}</strong><span>%</span></div>
      <div className="metric-name"><b>{label}</b><p>{description}</p></div>
      <div className="meter" role="progressbar" aria-label={`Uso de ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}><i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>
      <small>{meta}</small>
    </article>
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
      <ModuleTop code="REE/CONVERSATION-02" status={thinking ? "active" : "special"} label={thinking ? "ANALIZANDO" : "LISTA PARA ESCUCHAR"} />
      <div className={`ai-badge dark ${aiState.engine}`} title={aiState.reason}><i />{aiLabel}</div>
      <h1>Habla con tu PC.</h1><p>Pregunta por procesos, archivos o rendimiento. REE responderá sólo con las métricas que realmente puede ver.</p>
      <div className="prompt-chips">{suggestedQuestions.map((prompt) => <button key={prompt} onClick={() => void ask(prompt)} disabled={thinking}>{prompt}</button>)}</div>
      <div className="full-chat"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void ask(); }} placeholder="¿Qué te está pasando?" aria-label="Pregunta para REE" /><button disabled={thinking} onClick={() => void ask()}>{thinking ? "ANALIZANDO..." : "PREGUNTAR"}</button></div>
      <div className="assistant-reply"><div><b>REEBOT</b><small>{aiState.engine === "ollama" ? "MODELO LOCAL" : "MOTOR BÁSICO"}</small></div><p className={thinking ? "assistant-message thinking" : "assistant-message"} aria-live="polite">{reply}</p></div>
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

function ProcessesView({ metrics, memoryStatusValue }: { metrics: Metrics; memoryStatusValue: Status }) {
  return (
    <section className="module black full-view status-surface" data-status={memoryStatusValue}>
      <ModuleTop code="SYS/PROCESSES-04" status={memoryStatusValue} label={statusLabels[memoryStatusValue]} />
      <h1>¿Quién usa mis recursos?</h1><p>Una vista clara de lo que está activo. Un nombre desconocido no significa automáticamente que sea un virus.</p>
      <div className="process-table"><div className="process-row heading"><span>PROCESO</span><span>CPU</span><span>RAM</span></div>{metrics.processes.map((process) => <div className="process-row" key={process.pid}><span><b>{process.name}</b><small>PID {process.pid}</small></span><span>{process.cpu.toFixed(1)}%</span><span>{process.ram.toFixed(0)} MB</span></div>)}</div>
    </section>
  );
}

function SettingsView({ experience, setExperience, aiLabel, aiState }: { experience: Experience; setExperience: (experience: Experience) => void; aiLabel: string; aiState: AiState }) {
  return (
    <section className="module black full-view status-surface" data-status="neutral">
      <ModuleTop code="REE/PREFERENCES-05" status="neutral" label="CONTROL DEL USUARIO" />
      <h1>Tu Reebot, tus reglas.</h1><p>Personaliza cómo se comunica REE. Ningún ajuste del sistema se modifica sin tu permiso.</p>
      <div className="settings-grid"><label>NOMBRE DE LA PC<input defaultValue="Nébula" /></label><label>EXPERIENCIA<select value={experience} onChange={(event) => setExperience(event.target.value as Experience)}><option value="nuevo">Es mi primera PC</option><option value="intermedio">Tengo algo de técnico</option><option value="experto">Conozco bien mi PC</option></select></label><label>CONSUMO VISUAL<select defaultValue="visual"><option value="ahorro">Ahorro</option><option value="normal">Normal</option><option value="visual">Visual</option></select></label><label>MOTOR DE IA<input readOnly value={aiLabel} /></label></div>
      <p className="settings-note">{aiState.reason} REEBOT nunca aplicará cambios ni abrirá archivos sin pedir permiso.</p>
    </section>
  );
}

function LabEntry({ index, title, detail, status }: { index: string; title: string; detail: string; status: Status }) {
  return <div className="lab-entry" data-status={status}><span>{index}</span><div><b>{title}</b><p>{detail}</p></div><StatusTag status={status} label={statusLabels[status]} /><button>ABRIR</button></div>;
}
