// app/api/chat/route.js
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

function coerceMessagesForAnthropic(body) {
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

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const modelLabel = String(body?.model ?? "").trim();
    const temperature = typeof body?.temperature === "number" ? body.temperature : 0.4;
    const wantsClaude = modelLabel.toLowerCase() === "claude";

    if (wantsClaude) {
      // ---------- Try Claude (Anthropic) ----------
      const messages = coerceMessagesForAnthropic(body);
      if (!messages.length) {
        return new Response("No message provided", { status: 400 });
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return new Response("Anthropic API key not configured", { 
          status: 500,
          headers: { "Content-Type": "text/plain" }
        });
      }

      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 1024,
            temperature,
            messages,
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          return new Response(`Claude API error (${res.status}): ${errorText}`, { 
            status: 500,
            headers: { "Content-Type": "text/plain" }
          });
        }

        const data = await res.json();
        const reply = data?.content?.[0]?.text || "No response generated";

        return new Response(reply, {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });

      } catch (claudeErr) {
        return new Response(`Claude request failed: ${claudeErr.message}`, { 
          status: 500,
          headers: { "Content-Type": "text/plain" }
        });
      }
    }

    // ---------- OpenAI (default and safe fallback) ----------
    const messages = coerceMessagesForOpenAI(body);
    if (!messages.length) {
      return new Response("No message provided", { status: 400 });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return new Response("OpenAI API key not configured", { status: 500 });
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

    if (!res.ok) {
      const errorText = await res.text();
      return new Response(`OpenAI API error (${res.status}): ${errorText}`, { status: 500 });
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.toString?.()?.trim?.() || "No response generated";

    return new Response(reply, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  } catch (err) {
    // Fallback error handling - won't break OpenAI
    return new Response(`Server error: ${err?.message ?? String(err)}`, { 
      status: 500,
      headers: { "Content-Type": "text/plain" }
    });
  }
}