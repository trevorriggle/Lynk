// app/api/chat/route.js
export const runtime = "nodejs";

/* ---------- helpers (unchanged) ---------- */
const wantsAnthropic = (model = "", provider = "") =>
  (provider || "").toLowerCase() === "anthropic" ||
  (model || "").toLowerCase().includes("claude");

function splitSystemAndMsgs(raw = []) {
  const system = raw.filter(m => m.role === "system")
    .map(m => String(m.content ?? "")).join("\n\n") || undefined;
  const msgs = raw.filter(m => m.role !== "system");
  return { system, msgs };
}
function toOpenAIMessages(body) {
  if (Array.isArray(body?.messages) && body.messages.length) {
    return body.messages.map(m => ({
      role: m.role || "user",
      content: typeof m.content === "string" ? m.content : String(m?.content ?? "")
    }));
  }
  if (body?.message) return [{ role: "user", content: String(body.message) }];
  return [];
}
function toAnthropicPayload(body) {
  const raw = Array.isArray(body?.messages)
    ? body.messages
    : (body?.message ? [{ role: "user", content: String(body.message) }] : []);
  const { system, msgs } = splitSystemAndMsgs(raw);
  const messages = msgs.map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: [{ type: "text", text: typeof m.content === "string" ? m.content : String(m?.content ?? "") }]
  }));
  return { system, messages };
}

/* ---------- CORS helpers (safe even same-origin) ---------- */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* ---------- NEW: GET = health (prevents 405) ---------- */
export async function GET() {
  return Response.json(
    {
      ok: true,
      expects: "POST",
      note:
        "Call this endpoint with POST { provider:'openai'|'anthropic', message:'...' } " +
        "or { model:'gpt-4o-mini'|'claude-3-haiku-20240307', messages:[...] }",
    },
    { headers: cors }
  );
}

/* ---------- NEW: OPTIONS = preflight (prevents 405) ---------- */
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

/* ---------- POST = actual chat ---------- */
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const model = String(body?.model ?? "").trim();
    const provider = String(body?.provider ?? "").trim();
    const temperature = typeof body?.temperature === "number" ? body.temperature : 0.4;
    const max_tokens = typeof body?.max_tokens === "number" ? body.max_tokens : 256;

    // ----- Anthropic (Claude) -----
    if (wantsAnthropic(model, provider)) {
      if (!process.env.ANTHROPIC_API_KEY)
        return new Response("ANTHROPIC_API_KEY missing", { status: 500, headers: cors });

      const { system, messages } = toAnthropicPayload(body);
      if (!messages.length) return new Response("No message provided", { status: 400, headers: cors });

      const candidates = [];
      if (model && model.toLowerCase().includes("claude")) candidates.push(model);
      candidates.push("claude-3-5-sonnet-latest", "claude-3-haiku-latest", "claude-3-haiku-20240307");

      for (const m of candidates) {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({ model: m, max_tokens, temperature, ...(system ? { system } : {}), messages }),
        });
        const txt = await r.text();

        if (r.ok) {
          let out = "";
          try {
            const data = JSON.parse(txt);
            for (const block of data?.content || []) if (block.type === "text" && block.text) out += block.text;
          } catch {}
          return new Response(out || "Okay.", { status: 200, headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } });
        }
        if (r.status === 401 || r.status === 403) return new Response(`Claude ${r.status}: ${txt}`, { status: 502, headers: cors });
        if (m === candidates[candidates.length - 1]) return new Response(`Claude ${r.status}: ${txt}`, { status: 502, headers: cors });
      }
    }

    // ----- OpenAI (GPT) -----
    if (!process.env.OPENAI_API_KEY)
      return new Response("OPENAI_API_KEY missing", { status: 500, headers: cors });

    const messages = toOpenAIMessages(body);
    if (!messages.length) return new Response("No message provided", { status: 400, headers: cors });

    const chosen = model && model.toLowerCase().startsWith("gpt") ? model : "gpt-4o-mini";
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: chosen, messages, temperature, max_tokens, stream: false }),
    });
    const txt = await r.text();
    if (!r.ok) return new Response(`OpenAI ${r.status}: ${txt}`, { status: 502, headers: cors });

    let data = {};
    try { data = JSON.parse(txt); } catch {}
    const reply = data?.choices?.[0]?.message?.content?.toString?.().trim?.() || "Okay.";

    return new Response(reply, { status: 200, headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } });
  } catch (err) {
    return new Response(`Server error: ${err?.message || String(err)}`, { status: 500, headers: cors });
  }
}
