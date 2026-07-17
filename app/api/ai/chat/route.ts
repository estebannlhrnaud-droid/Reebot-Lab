import {
  askOllama,
  createBasicReply,
  getLocalAiStatus,
  normalizeMetrics,
  type ChatMessage,
} from "@/app/lib/local-ai";

type ChatRequest = {
  message?: unknown;
  history?: unknown;
  metrics?: unknown;
  profile?: unknown;
  experience?: unknown;
  mode?: unknown;
};

function normalizeHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-8).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    if (raw.role !== "user" && raw.role !== "assistant") return [];
    if (typeof raw.content !== "string" || !raw.content.trim()) return [];
    return [{ role: raw.role, content: raw.content.trim().slice(0, 2000) }];
  });
}

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = await request.json() as ChatRequest;
  } catch {
    return Response.json({ error: "La solicitud no contiene JSON válido." }, { status: 400 });
  }

  const question = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
  if (!question) {
    return Response.json({ error: "Escribe una pregunta para REE." }, { status: 400 });
  }

  const metrics = normalizeMetrics(body.metrics);
  const history = normalizeHistory(body.history);
  const profile = typeof body.profile === "string" ? body.profile.slice(0, 40) : "Estudio";
  const experience = typeof body.experience === "string" ? body.experience.slice(0, 40) : "intermedio";
  const forceBasic = body.mode === "basic";

  const status = await getLocalAiStatus();
  if (!forceBasic) {
    if (status.available && status.model) {
      try {
        const reply = await askOllama({ question, history, metrics, profile, experience, model: status.model });
        return Response.json({ reply, engine: "ollama", model: status.model, setupRequired: false });
      } catch {
        // Conserva una respuesta útil si el motor se detiene durante la consulta.
      }
    }
  }

  return Response.json({
    reply: createBasicReply(question, metrics),
    engine: "basic",
    model: null,
    setupRequired: !status.available,
    setupCommand: status.setupCommand,
    reason: status.reason,
  });
}
