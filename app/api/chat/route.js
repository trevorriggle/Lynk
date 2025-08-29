// app/api/chat/route.js
export const runtime = "nodejs";

/* ---------- helpers ---------- */
function splitSystemAndMsgs(raw = []) {
  const system = raw.filter(m => m.role === "system").map(m => String(m.content ?? "")).join("\n\n") || undefined;
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

const wantsAnthropic = (model = "", provider = "") =>
  (provider || "").toLowerCase() === "anthropic" || (model || "").toLowerCase().includes("claude");

/* ---------- route ---------- */
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const model = String(body?.model ?? "").trim();
    const provider = String(body?.provider ?? "").trim();
    const temperature = typeof body?.temperature === "number" ? body.temperature : 0.4;
    const max_tokens = typeof body?.max_tokens === "number" ? body.max_tokens : 1024;

    // ---- Anthropic (Claude) ----
    if (wantsAnthropic(model, provider)) {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return new Response("ANTHROPIC_API_KEY not configured", { status: 500 });

      const { system, messages } = toAnthropicPayload(body);
      if (!messages.length) return new Response("No message provided", { status: 400 });

      const chosen = model && model.toLowerCase().includes("claude") ? model : "claude-3-5-sonnet-latest";

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({ model: chosen, max_tokens, temperature, ...(system ? { system } : {}), messages })
      });

      const text = await r.text();
      if (!r.ok) return new Response(`Claude ${r.status}: ${text}`, { status: 502 });

      let data = {};
      try { data = JSON.parse(text); } catch {}
      let out = "";
      for (const block of data?.content || []) if (block.type === "text" && block.text) out += block.text;
      return new Response(out || "Okay.", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    // ---- OpenAI (GPT) ----
    const key = process.env.OPENAI_API_KEY;
    if (!key) return new Response("OPENAI_API_KEY not configured", { status: 500 });

    const messages = toOpenAIMessages(body);
    if (!messages.length) return new Response("No message provided", { status: 400 });

    const chosen = model && model.toLowerCase().startsWith("gpt") ? model : "gpt-4o-mini";

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: chosen, messages, temperature, max_tokens, stream: false })
    });

    const text = await r.text();
    if (!r.ok) return new Response(`OpenAI ${r.status}: ${text}`, { status: 502 });

    let data = {};
    try { data = JSON.parse(text); } catch {}
    const reply = data?.choices?.[0]?.message?.content?.toString?.().trim?.() || "Okay.";
    return new Response(reply, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  } catch (err) {
    return new Response(`Server error: ${err?.message || String(err)}`, { status: 500 });
  }
}
