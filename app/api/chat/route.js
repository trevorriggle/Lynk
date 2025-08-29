// app/api/chat/route.js
export const runtime = "nodejs";

function coerceMessages(body) {
  if (Array.isArray(body?.messages) && body.messages.length) {
    return body.messages.map((m) => ({
      role: m?.role === "assistant" ? "assistant" : "user",
      content: [{ type: "text", text: String(m?.content ?? "") }],
    }));
  }
  if (body?.message) {
    return [{ role: "user", content: [{ type: "text", text: String(body.message) }] }];
  }
  return [];
}

function coerceMessagesForOpenAI(body) {
  if (Array.isArray(body?.messages) && body.messages.length) {
    return body.messages.map((m) => ({
      role: m?.role || "user",
      content: typeof m?.content === "string" ? m.content : String(m?.content ?? ""),
    }));
  }
  if (body?.message) {
    return [{ role: "user", content: String(body.message) }];
  }
  return [];
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const modelLabel = String(body?.model ?? "").trim();
  const temperature = typeof body?.temperature === "number" ? body.temperature : 0.4;

  const wantsClaude = modelLabel.toLowerCase() === "claude";

  try {
    if (wantsClaude) {
      // ---------- Claude (Anthropic) ----------
      const messages = coerceMessages(body);
      if (!messages.length) return new Response("No message provided", { status: 400 });

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return new Response("Missing ANTHROPIC_API_KEY", { status: 500 });
      }

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20240620",
          max_tokens: 1024,
          temperature,
          messages,
        }),
      });

      const detail = await res.text().catch(() => "");
      if (!res.ok) {
        return new Response(`Claude API error (${res.status}): ${detail}`, { status: 500 });
      }

      let data;
      try { 
        data = detail ? JSON.parse(detail) : {}; 
      } catch {}
      
      const reply =
        Array.isArray(data?.content) && data.content[0]?.text
          ? String(data.content[0].text).trim()
          : "No response generated";

      return new Response(reply, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // ---------- OpenAI (default) ----------
    const messages = coerceMessagesForOpenAI(body);
    if (!messages.length) return new Response("No message provided", { status: 400 });

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return new Response("Missing OPENAI_API_KEY", { status: 500 });
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature,
        stream: false,
      }),
    });

    const detail = await res.text().catch(() => "");
    if (!res.ok) {
      return new Response(`OpenAI API error (${res.status}): ${detail}`, { status: 500 });
    }

    let data;
    try { 
      data = detail ? JSON.parse(detail) : {}; 
    } catch {}
    
    const reply =
      data?.choices?.[0]?.message?.content?.toString?.().trim?.() || 
      "No response generated";

    return new Response(reply, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    return new Response(`Server error: ${err?.message ?? String(err)}`, { status: 500 });
  }
}