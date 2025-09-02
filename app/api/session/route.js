// app/api/session/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import OpenAI from "openai";

// --- CORS / headers (match your style) ---
const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "X-Lynk-Route": "session",
};

// --- Minimal in-memory session store ---
/**
 * Session shape:
 * {
 *   turns: Array<{ role: "user"|"assistant", content: string, provider?: string, model?: string }>,
 *   last: { provider?: string, model?: string }
 * }
 */
const SESSIONS = new Map();
const getSession = (id) => {
  if (!SESSIONS.has(id)) SESSIONS.set(id, { turns: [], last: {} });
  return SESSIONS.get(id);
};

// --- helpers ---
const asText = (x) => (typeof x === "string" ? x : String(x ?? ""));
const takeLast = (arr, n) => arr.slice(Math.max(0, arr.length - n));

// Build messages for OpenAI (chat.completions)
function buildOpenAIMessages(turns) {
  // (We’ll add system/inspector later; for step 1 just replay recent turns.)
  return takeLast(turns, 14).map((t) => ({
    role: t.role === "assistant" ? "assistant" : "user",
    content: t.content,
  }));
}

// Build messages for Anthropic (Messages API)
function buildAnthropicMessages(turns) {
  // Anthropic expects [{role:"user"|"assistant", content:[{type:"text", text}]}]
  return takeLast(turns, 14).map((t) => ({
    role: t.role === "assistant" ? "assistant" : "user",
    content: [{ type: "text", text: t.content }],
  }));
}

// --- preflight ---
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: H });
}

// --- simple health/debug ---
export async function GET() {
  return Response.json(
    {
      ok: true,
      sessions: SESSIONS.size,
      now: new Date().toISOString(),
      expects: "POST { sessionId, message, model: { label, provider, model } }",
    },
    { headers: H }
  );
}

// --- main POST ---
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    let message = asText(body?.message ?? body?.messages?.[0]?.content ?? "");
    if (!message) return new Response("Missing message", { status: 400, headers: H });

    // session id (if missing, create one so local tests still work)
    let sessionId = asText(body?.sessionId || "");
    if (!sessionId) {
      try {
        // @ts-ignore
        sessionId = crypto.randomUUID();
      } catch {
        sessionId = "sess_" + Math.random().toString(36).slice(2);
      }
    }

    // model meta from the pill
    const modelMeta = body?.model || {};
    const provider = asText(modelMeta?.provider || "anthropic");
    const modelName = asText(modelMeta?.model || (provider === "openai" ? "gpt-4o-mini" : "claude-3-haiku-20240307"));

    // 1) append user turn
    const s = getSession(sessionId);
    s.turns.push({ role: "user", content: message, provider, model: modelName });

    // 2) call chosen provider with recent context (last ~14 turns)
    let assistantText = "";
    if (provider === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return new Response("OPENAI_API_KEY missing", { status: 500, headers: H });

      const client = new OpenAI({ apiKey: key });
      const r = await client.chat.completions.create({
        model: modelName,
        max_tokens: 256,
        temperature: 0.4,
        messages: buildOpenAIMessages(s.turns),
      });
      assistantText = r?.choices?.[0]?.message?.content?.toString?.() || "Okay.";
    } else {
      // anthropic
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return new Response("ANTHROPIC_API_KEY missing", { status: 500, headers: H });

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: 256,
          temperature: 0.4,
          messages: buildAnthropicMessages(s.turns),
        }),
      });
      const txt = await r.text();
      if (!r.ok) return new Response(`Claude ${r.status}: ${txt}`, { status: 502, headers: H });

      try {
        const data = JSON.parse(txt);
        for (const b of data?.content || []) if (b?.type === "text" && b?.text) assistantText += b.text;
      } catch {
        assistantText = txt || "Okay.";
      }
    }

    // 3) append assistant turn + remember last used model
    s.turns.push({ role: "assistant", content: assistantText, provider, model: modelName });
    s.last = { provider, model: modelName };

    // 4) return plain text for easy drop-in with current Chat.jsx
    return new Response(assistantText, {
      status: 200,
      headers: { ...H, "Content-Type": "text/plain; charset=utf-8", "X-Session-Id": sessionId },
    });
  } catch (e) {
    return new Response(`Session error: ${e?.message || String(e)}`, { status: 500, headers: H });
  }
}
