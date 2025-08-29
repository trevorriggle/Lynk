// app/api/chat/route.js - RESTORE OPENAI FIRST
export const runtime = "nodejs";

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
  try {
    const body = await req.json().catch(() => ({}));
    const modelLabel = String(body?.model ?? "").trim();
    const temperature = typeof body?.temperature === "number" ? body.temperature : 0.4;
    const wantsClaude = modelLabel.toLowerCase() === "claude";

    if (wantsClaude) {
      // For now, return an error message instead of trying Claude
      return new Response("Claude is temporarily unavailable due to API key issues. Please check your Anthropic API key in Vercel environment variables.", { 
        status: 500,
        headers: { "Content-Type": "text/plain" }
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