// app/api/chat/route.js
export const runtime = "nodejs";

/* -------------------- helpers -------------------- */
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

async function fetchJSON(url, opts) {
  const t0 = Date.now();
  const res = await fetch(url, opts);
  const txt = await res.text();
  const latency_ms = Date.now() - t0;
  let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
  return { res, txt, data, latency_ms };
}

/* -------------------- route -------------------- */
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const model = String(body?.model ?? "").trim();
    const provider = String(body?.provider ?? "").trim();
    const temperature = typeof body?.temperature === "number" ? body.temperature : 0.4;
    const max_tokens = typeof body?.max_tokens === "number" ? body.max_tokens : 1024;

    /* ---------- Anthropic (Claude) path ---------- */
    if (wantsAnthropic(model, provider)) {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) {
        return Response.json({ ok:false, provider:"anthropic", error:"ANTHROPIC_API_KEY not configured" }, { status: 500 });
      }

      const { system, messages } = toAnthropicPayload(body);
      if (!messages.length) {
        return Response.json({ ok:false, provider:"anthropic", error:"No message provided" }, { status: 400 });
      }

      // Try requested model; if not provided, try sonnet latest, then haiku latest
      const orderedModels = [];
      if (model && model.toLowerCase().includes("claude")) orderedModels.push(model);
      orderedModels.push("claude-3-5-sonnet-latest", "claude-3-haiku-latest");

      let last = null;
      for (const m of orderedModels) {
        const { res, txt, data, latency_ms } = await fetchJSON("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({ model: m, max_tokens, temperature, ...(system ? { system } : {}), messages })
        });

        if (res.ok) {
          // flatten text blocks
          let out = "";
          for (const block of data?.content || []) if (block.type === "text" && block.text) out += block.text;
          return Response.json({
            ok: true,
            provider: "anthropic",
            model_used: m,
            latency_ms,
            text: out || "Okay."
          });
        }
        last = { status: res.status, body: txt, model: m, latency_ms };
        // On 404/400 model errors, try fallback; on 401/403 don't bother retrying
        if (res.status === 401 || res.status === 403) break;
      }

      return Response.json({
        ok: false,
        provider: "anthropic",
        hint: "Check model access or payload; see body.",
        last_attempt: last
      }, { status: 502 });
    }

    /* ---------- OpenAI (GPT) path ---------- */
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return Response.json({ ok:false, provider:"openai", error:"OPENAI_API_KEY not configured" }, { status: 500 });
    }

    const messages = toOpenAIMessages(body);
    if (!messages.length) {
      return Response.json({ ok:false, provider:"openai", error:"No message provided" }, { status: 400 });
    }

    // Try requested model; else 4o-mini then 4o
    const orderedModels = [];
    if (model && model.toLowerCase().startsWith("gpt")) orderedModels.push(model);
    orderedModels.push("gpt-4o-mini", "gpt-4o");

    let last = null;
    for (const m of orderedModels) {
      const { res, txt, data, latency_ms } = await fetchJSON("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${key}`
        },
        body: JSON.stringify({ model: m, messages, temperature, max_tokens, stream: false })
      });

      if (res.ok) {
        const content = data?.choices?.[0]?.message?.content?.toString?.().trim?.() || "Okay.";
        return Response.json({
          ok: true,
          provider: "openai",
          model_used: m,
          latency_ms,
          text: content
        });
      }
      last = { status: res.status, body: txt, model: m, latency_ms };
      if (res.status === 401 || res.status === 403) break;
    }

    return Response.json({
      ok: false,
      provider: "openai",
      hint: "Check model access or payload; see body.",
      last_attempt: last
    }, { status: 502 });

  } catch (err) {
    return Response.json({ ok:false, error:`Server error: ${err?.message || String(err)}` }, { status: 500 });
  }
}

