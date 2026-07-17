export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ProcessSnapshot = {
  name: string;
  pid: number;
  cpu: number;
  ram: number;
};

export type MetricsSnapshot = {
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
  memoryUsed: number;
  memoryTotal: number;
  diskName: string;
  diskFree: number;
  processes: ProcessSnapshot[];
};

type OllamaTagsResponse = {
  models?: Array<{ name?: string; model?: string }>;
};

type OllamaChatResponse = {
  message?: { content?: string };
};

export type LocalAiStatus = {
  engine: "ollama" | "basic";
  available: boolean;
  model: string | null;
  models: string[];
  reason: string;
  setupCommand: string;
};

const OLLAMA_URL = (process.env.REEBOT_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const PREFERRED_MODEL = process.env.REEBOT_AI_MODEL || "qwen3.5:9b";
const SETUP_COMMAND = `ollama run ${PREFERRED_MODEL}`;

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeMetrics(value: unknown): MetricsSnapshot {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawProcesses = Array.isArray(raw.processes) ? raw.processes : [];
  const processes = rawProcesses.slice(0, 8).map((item) => {
    const process = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      name: String(process.name || "proceso desconocido").slice(0, 80),
      pid: finiteNumber(process.pid),
      cpu: finiteNumber(process.cpu),
      ram: finiteNumber(process.ram),
    };
  });

  return {
    cpu: finiteNumber(raw.cpu),
    memory: finiteNumber(raw.memory),
    gpu: finiteNumber(raw.gpu),
    gpuTemp: finiteNumber(raw.gpuTemp),
    vram: finiteNumber(raw.vram),
    vramUsed: finiteNumber(raw.vramUsed),
    vramTotal: finiteNumber(raw.vramTotal),
    disk: finiteNumber(raw.disk),
    read: finiteNumber(raw.read),
    write: finiteNumber(raw.write),
    memoryUsed: finiteNumber(raw.memoryUsed),
    memoryTotal: finiteNumber(raw.memoryTotal),
    diskName: String(raw.diskName || "Disco no identificado").slice(0, 120),
    diskFree: finiteNumber(raw.diskFree),
    processes,
  };
}

function withTimeout(milliseconds: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function selectModel(models: string[]) {
  if (models.includes(PREFERRED_MODEL)) return PREFERRED_MODEL;
  return models.find((model) => !model.toLowerCase().includes("embed")) || null;
}

export async function getLocalAiStatus(): Promise<LocalAiStatus> {
  const timeout = withTimeout(1800);
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      cache: "no-store",
      signal: timeout.signal,
    });
    if (!response.ok) throw new Error(`Ollama respondió ${response.status}`);
    const payload = await response.json() as OllamaTagsResponse;
    const models = (payload.models || [])
      .map((entry) => entry.name || entry.model || "")
      .filter(Boolean);
    const model = selectModel(models);

    if (!model) {
      return {
        engine: "basic",
        available: false,
        model: null,
        models,
        reason: "Ollama está activo, pero todavía no tiene un modelo de conversación.",
        setupCommand: SETUP_COMMAND,
      };
    }

    return {
      engine: "ollama",
      available: true,
      model,
      models,
      reason: "La IA local está lista y no necesita internet para responder.",
      setupCommand: SETUP_COMMAND,
    };
  } catch {
    return {
      engine: "basic",
      available: false,
      model: null,
      models: [],
      reason: "Ollama no está instalado o no está activo; REEBOT usa su análisis básico local.",
      setupCommand: SETUP_COMMAND,
    };
  } finally {
    timeout.clear();
  }
}

function topProcess(metrics: MetricsSnapshot) {
  return [...metrics.processes].sort((a, b) => b.ram - a.ram)[0];
}

export function createBasicReply(question: string, metrics: MetricsSnapshot) {
  const normalized = question.toLocaleLowerCase("es-MX");
  const process = topProcess(metrics);

  if (normalized.includes("ram") || normalized.includes("memoria")) {
    if (metrics.memory >= 85) {
      return `Tu RAM está al ${Math.round(metrics.memory)}%, un nivel alto. ${process ? `${process.name} es el proceso visible que más memoria usa (${Math.round(process.ram)} MB). ` : ""}Te recomiendo cerrar sólo lo que reconozcas; antes puedo guiarte para comprobar qué es seguro.`;
    }
    return `Tu RAM está al ${Math.round(metrics.memory)}%, así que todavía tiene margen. ${process ? `El proceso visible con mayor consumo es ${process.name} con ${Math.round(process.ram)} MB.` : "No recibí la lista de procesos."}`;
  }

  if (normalized.includes("disco") || normalized.includes("ssd") || normalized.includes("lenta") || normalized.includes("transferencia")) {
    if (metrics.disk >= 90) {
      return `El ${metrics.diskName} está al ${Math.round(metrics.disk)}% de actividad y ahora escribe a ${metrics.write.toFixed(1)} MB/s. El almacenamiento probablemente está marcando el ritmo; conviene medir su velocidad real con un experimento guiado antes de concluir que está dañado.`;
    }
    return `El ${metrics.diskName} está al ${Math.round(metrics.disk)}% de actividad y tiene ${metrics.diskFree.toFixed(1)} GB libres. En este momento no está saturado; para explicar una lentitud pasada necesitamos registrar el próximo pico.`;
  }

  if (normalized.includes("cpu") || normalized.includes("procesador")) {
    return metrics.cpu >= 85
      ? `El procesador está al ${Math.round(metrics.cpu)}%, que sí es una carga alta. Revisemos qué proceso provoca el pico antes de cerrar o cambiar nada.`
      : `El procesador está al ${Math.round(metrics.cpu)}%; no parece ser el cuello de botella en este momento.`;
  }

  if (normalized.includes("virus") || normalized.includes("sospech") || normalized.includes("proceso")) {
    return "Puedo señalar procesos poco comunes, pero con estas métricas no puedo afirmar que algo sea un virus. El siguiente paso seguro es revisar nombre, ruta, firma digital y comportamiento; te pediré permiso antes de inspeccionar archivos.";
  }

  if (normalized.includes("fps") || normalized.includes("gráfic") || normalized.includes("vram") || normalized.includes("juego")) {
    if (metrics.vramTotal <= 0) return "Todavía no recibo una lectura de VRAM, así que no voy a inventar un diagnóstico. Sí puedo comparar CPU, RAM y disco mientras añadimos la telemetría gráfica.";
    if (metrics.vram >= 90) return `La VRAM está al ${Math.round(metrics.vram)}% (${metrics.vramUsed.toFixed(1)} de ${metrics.vramTotal.toFixed(1)} GB). Antes de cambiar Windows, prueba bajar texturas un nivel y compara estabilidad y calidad dentro del juego.`;
    return `La GPU está al ${Math.round(metrics.gpu)}% y la VRAM al ${Math.round(metrics.vram)}% (${metrics.vramUsed.toFixed(1)} de ${metrics.vramTotal.toFixed(1)} GB), así que no parecen saturadas en esta instantánea.`;
  }

  const pressure = Math.max(metrics.cpu, metrics.memory, metrics.disk);
  if (pressure >= 90) {
    const resource = pressure === metrics.cpu ? "CPU" : pressure === metrics.memory ? "RAM" : "disco";
    return `Veo presión alta en ${resource}: ${Math.round(pressure)}%. No cambiaré nada automáticamente; puedo ayudarte a identificar la causa y proponer una prueba reversible.`;
  }

  return `Tu PC se ve estable ahora: CPU ${Math.round(metrics.cpu)}%, RAM ${Math.round(metrics.memory)}% y disco ${Math.round(metrics.disk)}%. Pregúntame por una lentitud, un proceso, un juego o un componente y te explico qué revisar.`;
}

function systemPrompt(metrics: MetricsSnapshot, profile: string, experience: string, model: string) {
  const processSummary = metrics.processes.length
    ? metrics.processes.map((process) => `${process.name} (PID ${process.pid}, RAM ${process.ram.toFixed(0)} MB)`).join("; ")
    : "sin procesos disponibles";

  return `Eres REE, la mascota y compañera de la PC dentro de REEBOT LAB.
Hablas en español mexicano, de forma clara, amable y breve. Responde directamente, sin saludos genéricos ni apodos como "gamer". El nivel del usuario es: ${experience}. Su perfil activo es: ${profile}.
Tu objetivo es explicar qué ocurre, distinguir hechos de hipótesis y proponer el siguiente experimento guiado más seguro.
Ahora mismo estás ejecutándote localmente mediante Ollama con el modelo ${model}. Si la VRAM está alta y aparece llama-server, explica que tu propio modelo local es la causa esperada. Si el usuario quiere liberar esa VRAM, ofrece detener temporalmente el modelo local después de pedir permiso; no digas que existe una versión de "memoria sola" ni que debe volver a descargar el modelo.
Nunca afirmes haber visto archivos, firmas, temperaturas, GPU o VRAM si no aparecen en el contexto. Nunca llames virus a un proceso sólo por su nombre.
REGLA CRÍTICA: el porcentaje de disco representa ACTIVIDAD o TIEMPO ACTIVO, no espacio ocupado. La capacidad disponible aparece por separado en GB libres. Nunca digas que el disco está lleno basándote en el porcentaje de actividad.
No deduzcas el tipo de carga de un proceso por su nombre. Menciona un proceso como posible causa sólo cuando su CPU o RAM visible sea realmente alta; sin métricas de GPU no atribuyas carga gráfica.
Una lectura o escritura de 0 MB/s sólo significa que no hubo transferencia en esa instantánea; no demuestra que una aplicación esté esperando datos ni explica por sí sola una lentitud pasada.
La CPU individual por proceso todavía no se mide en esta versión. No interpretes sus valores como uso real ni afirmes que un proceso está inactivo basándote en ellos.
No recomiendes borrar temporales, reinstalar, cerrar procesos o modificar ajustes si los datos no demuestran que eso responde a la pregunta.
No cambies configuraciones ni des instrucciones destructivas. Antes de inspeccionar archivos, cerrar procesos o aplicar cambios, explica el impacto y pide permiso.
Responde en 2 a 5 frases: diagnóstico comprensible, evidencia disponible y recomendación concreta.

Métricas actuales:
- CPU: ${metrics.cpu.toFixed(1)}%
- GPU: ${metrics.gpu.toFixed(1)}%, temperatura ${metrics.gpuTemp.toFixed(0)} °C
- VRAM: ${metrics.vram.toFixed(1)}% (${metrics.vramUsed.toFixed(1)} de ${metrics.vramTotal.toFixed(1)} GB)
- RAM: ${metrics.memory.toFixed(1)}% (${metrics.memoryUsed.toFixed(1)} de ${metrics.memoryTotal.toFixed(1)} GB)
- Actividad del disco: ${metrics.disk.toFixed(1)}%, lectura ${metrics.read.toFixed(1)} MB/s, escritura ${metrics.write.toFixed(1)} MB/s
- Unidad: ${metrics.diskName}, ${metrics.diskFree.toFixed(1)} GB libres
- Procesos visibles: ${processSummary}`;
}

export async function askOllama(input: {
  question: string;
  history: ChatMessage[];
  metrics: MetricsSnapshot;
  profile: string;
  experience: string;
  model: string;
}) {
  const timeout = withTimeout(120000);
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: timeout.signal,
      body: JSON.stringify({
        model: input.model,
        stream: false,
        think: false,
        keep_alive: "10m",
        options: { temperature: 0.35, num_ctx: 8192, num_predict: 480 },
        messages: [
          { role: "system", content: systemPrompt(input.metrics, input.profile, input.experience, input.model) },
          ...input.history.slice(-8),
          { role: "user", content: input.question },
        ],
      }),
    });

    if (!response.ok) throw new Error(`Ollama respondió ${response.status}`);
    const payload = await response.json() as OllamaChatResponse;
    const content = payload.message?.content?.trim();
    if (!content) throw new Error("Ollama devolvió una respuesta vacía");
    return content;
  } finally {
    timeout.clear();
  }
}
