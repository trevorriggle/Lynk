// app/api/chat/route.js — CLAUDE-ONLY (no OpenAI, no model switch)
export const runtime = "nodejs";

// allow same-origin + any preflight so you never see 405
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type",
};

// GET = simple health (optional)
export async function GET() {
  return Response.json({ ok: true, provider: "anthropic-only", model: "claude-3-haiku-20240307" }, { headers: CORS });
}
// OPTIONS = preflight ok
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// --- tiny helper: coerce input into Anthropic format
function toAnthropicMessages(body) {
  // accept either {message: "..."} or {messages:[{role, content}]}
  if (Array.isArray(body?.messages) && body.messages.length) {
    const system = body.messages
      .filter(m => m.role === "system")
      .map(m => String(m.content ?? ""))
      .join("\n\n");

    const msgs = body.messages
      .filter(m => m.role !== "system")
      .map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: [{ type: "text", text: typeof m.content === "string" ? m.content : String(m?.content ?? "") }],
      }));

    return { system: system || undefined, messages: msgs };
  }

  // fallback: single user message
  const text = typeof body?.message === "string" ? body.message : String(body?.message ?? "Say hi in one sentence.");
  return { system: undefined, messages: [{ role: "user", content: [{ type: "text", text }] }] };
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response("ANTHROPIC_API_KEY missing", { status: 500, headers: CORS });
    }

    const temperature = typeof body?.temperature === "number" ? body.temperature : 0.4;
    const max_tokens = typeof body?.max_tokens === "number" ? body.max_tokens : 256;

    const { system, messages } = toAnthropicMessages(body);
    if (!messages.length) {
      return new Response("No message provided", { status: 400, headers: CORS });
    }

    // *** single, safe model that works broadly ***
    const model = "claude-3-haiku-20240307";

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens,
        temperature,
        ...(system ? { system } : {}),
        messages,
      }),
    });

    const txt = await r.text();
    if (!r.ok) {
      // show Anthropic's complaint verbatim so you know exactly what's wrong
      return new Response(`Claude ${r.status}: ${txt}`, { status: 502, headers: CORS });
    }

    // flatten text blocks → return plain text for your chat bubble
    let out = "";
    try {
      const data = JSON.parse(txt);
      for (const block of data?.content || []) {
        if (block.type === "text" && block.text) out += block.text;
      }
    } catch { /* ignore parse errors, txt was already ok */ }

    return new Response(out || "Okay.", {
      status: 200,
      headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return new Response(`Server error: ${e?.message || String(e)}`, { status: 500, headers: CORS });
  }
}
