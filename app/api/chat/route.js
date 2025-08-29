// app/api/chat/route.js
export const runtime = "nodejs";

/* helpers */
const wantsAnthropic = (model = "", provider = "") =>
  (provider || "").toLowerCase() === "anthropic" ||
  (model || "").toLowerCase().includes("claude");

function toText(x) { return typeof x === "string" ? x : String(x ?? ""); }

function normalizeOpenAIMessages(body) {
  if (Array.isArray(body?.messages) && body.messages.length) {
    return body.messages.map(m => ({ role: m.role || "user", content: toText(m.content) }));
  }
  return [{ role: "user", content: toText(body?.message ?? "Say hi in one sentence.") }];
}

function normalizeAnthropicMessages(body) {
  const raw = Array.isArray(body?.messages) && body.messages.length
    ? body.messages
    : [{ role: "user", content: toText(body?.message ?? "Say hi in one sentence.") }];

  const system = raw.filter(m => m.role === "system").map(m => toText(m.content)).join("\n\n") || undefined;
  const msgs = raw.filter(m => m.role !== "system").map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: [{ type: "text", text: toText(m.content) }]
  }));

  return { system, messages: msgs };
}

async function fetchJSON(url, init) {
  const t0 = Date.now();
  const res = await fetch(url, init);
  const bodyText = await res.text();
  let data = null; try { data = bodyText ? JSON.parse(bodyText) : null; } catch {}
  return { ok: res.ok, status: res.status, statusText: res.statusText, ms: Date.now() - t0, data, bodyText };
}

/* CORS / 405 prevention */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
export async function OPTIONS() { return new Response(null, { status: 204, headers: cors }); }
export async function GET() { return Response.json({ ok:true, expects:"POST" }, { headers: cors }); }

/* POST = main */
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const provider = (body?.provider || "").toLowerCase();
    const model = String(body?.model ?? "");
    const temperature = typeof body?.temperature === "number" ? body.temperature : 0.4;
    const max_tokens = typeof body?.max_tokens === "number" ? body.max_tokens : 256;

    // ---------- Anthropic (Claude) ----------
    if (wantsAnthropic(model, provider)) {
      if (!process.env.ANTHROPIC_API_KEY) {
        return Response.json({ ok:false, provider:"anthropic", error:"ANTHROPIC_API_KEY missing" }, { status: 500, headers: cors });
      }
      const { system, messages } = normalizeAnthropicMessages(body);

      // very safe model cascade: requested -> sonnet-latest -> haiku-latest -> haiku-20240307
      const candidates = [];
      if (model && model.toLowerCase().includes("claude")) candidates.push(model);
      candidates.push("claude-3-5-sonnet-latest", "claude-3-haiku-latest", "claude-3-haiku-20240307");

      let last = null;
      for (const m of candidates) {
        const r = await fetchJSON("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({ model: m, max_tokens, temperature, ...(system ? { system } : {}), messages })
        });

        if (r.ok) {
          let out = "";
          for (const block of r.data?.content || []) if (block.type === "text" && block.text) out += block.text;
          return Response.json({ ok:true, provider:"anthropic", model_used:m, latency_ms:r.ms, text: out || "Okay." }, { headers: cors });
        }
        last = { status:r.status, statusText:r.statusText, model:m, latency_ms:r.ms, body:r.bodyText?.slice(0, 800) };
        if (r.status === 401 || r.status === 403) break; // auth/access—don’t keep trying
      }
      return Response.json({ ok:false, provider:"anthropic", hint:"See last_attempt for the provider error", last_attempt:last }, { status: 502, headers: cors });
    }

    // ---------- OpenAI (GPT) ----------
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ ok:false, provider:"openai", error:"OPENAI_API_KEY missing" }, { status: 500, headers: cors });
    }
    const messages = normalizeOpenAIMessages(body);
    const chosen = model && model.toLowerCase().startsWith("gpt") ? model : "gpt-4o-mini";

    const r = await fetchJSON("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({ model: chosen, messages, temperature, max_tokens, stream:false })
    });

    if (r.ok) {
      const content = r.data?.choices?.[0]?.message?.content?.toString?.().trim?.() || "Okay.";
      return Response.json({ ok:true, provider:"openai", model_used:chosen, latency_ms:r.ms, text: content }, { headers: cors });
    }
    return Response.json({ ok:false, provider:"openai", last_attempt:{ status:r.status, statusText:r.statusText, body:r.bodyText?.slice(0,800) } }, { status: 502, headers: cors });

  } catch (e) {
    return Response.json({ ok:false, error:`Server error: ${e?.message || String(e)}` }, { status: 500, headers: cors });
  }
}
