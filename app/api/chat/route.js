// app/api/chat/route.js

export const runtime = "nodejs";

// Normalize incoming body into messages array (role/content as strings)
function coerceMessages(body) {
  if (Array.isArray(body?.messages) && body.messages.length) {
    return body.messages.map((m) => ({
      role: m?.role || "user",
      content:
        typeof m?.content === "string" ? m.content : String(m?.content ?? ""),
    }));
  }
  if (body?.message) {
    return [{ role: "user", content: String(body.message) }];
  }
  return [];
}

// Convert Vercel-style messages -> Anthropic Messages API format
function toAnthropicMessages(vercelMessages = []) {
  return vercelMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role,
      content: [{ type: "text", text: String(m.content ?? "") }],
    }));
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const messages = coerceMessages(body);

  if (!messages.length) return new Response("No message provided", { status: 400 });

  const temperature =
    typeof body.temperature === "number" ? body.temperature : 0.4;

  // Simple family toggle: "Anthropic" => Claude; anything else => OpenAI
  const wantsClaude = String(body.model || "").toLowerCase() === "anthropic";

  if (wantsClaude) {
    // ---------- Claude (Anthropic) ----------
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return new Response("Missing ANTHROPIC_API_KEY", { status: 500 });

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20240620",
          temperature,
          max_tokens: 1024,
          messages: toAnthropicMessages(messages),
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return new Response(
          `Claude request failed (${res.status}).\n${detail}`.trim(),
          { status: 500 }
        );
      }

      const data = await res.json();
      const reply =
        Array.isArray(data?.content) && data.content[0]?.text
          ? String(data.content[0].text).trim()
          : "Okay.";

      return new Response(reply, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    } catch (err) {
      return new Response(`Claude error: ${err?.message ?? String(err)}`, {
        status: 500,
      });
    }
  }

  // ---------- OpenAI (default) ----------
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return new Response("Missing OPENAI_API_KEY", { status: 500 });

  try {
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
        stream: false, // non-streaming; still return text/plain below
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return new Response(
        `OpenAI request failed (${res.status}).\n${detail}`.trim(),
        { status: 500 }
      );
    }

    const data = await res.json();
    const reply =
      data?.choices?.[0]?.message?.content?.toString?.().trim?.() || "Okay.";

    return new Response(reply, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    return new Response(`OpenAI error: ${err?.message ?? String(err)}`, {
      status: 500,
    });
  }
}
