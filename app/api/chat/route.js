// app/api/chat/route.js
export const runtime = "nodejs";

function coerceMessages(body) {
  if (Array.isArray(body?.messages) && body.messages.length) {
    return body.messages.map((m) => ({
      role: m?.role === "assistant" ? "assistant" : "user", // keep to user/assistant only
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
      const messages = coerceMessages(body); // Anthropic format
      if (!messages.length) return new Response("No message provided", { status: 400 });

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return new Response(
          "Server misconfig: Missing ANTHROPIC_API_KEY (check Vercel → Settings → Environment Variables → Production, then redeploy).",
          { status: 500 }
        );
      }

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

      const detail = await res.text().catch(() => "");
      if (!res.ok) {
        // Show Anthropic's error text directly in the bubble
        return new Response(
          `Claude request failed (${res.status}).\n${detail || "(no body)"}\n\nBranch: Anthropic\nModel: claude-3-5-sonnet-20241022`,
          { status: 500 }
        );
      }

      let data;
      try { data = detail ? JSON.parse(detail) : {}; } catch {}
      const reply =
        Array.isArray(data?.content) && data.content[0]?.text
          ? String(data.content[0].text).trim()
          : "Okay.";

      return new Response(reply, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // ---------- OpenAI (default) - UNCHANGED FROM YOUR WORKING VERSION ----------
    const messages = coerceMessagesForOpenAI(body); // OpenAI format
    if (!messages.length) return new Response("No message provided", { status: 400 });

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return new Response(
        "Server misconfig: Missing OPENAI_API_KEY (check Vercel → Settings → Environment Variables → Production, then redeploy).",
        { status: 500 }
      );
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
      return new Response(
        `OpenAI request failed (${res.status}).\n${detail || "(no body)"}\n\nBranch: OpenAI\nModel: gpt-4o-mini`,
        { status: 500 }
      );
    }

    let data;
    try { data = detail ? JSON.parse(detail) : {}; } catch {}
    const reply =
      data?.choices?.[0]?.message?.content?.toString?.().trim?.() || "Okay.";

    return new Response(reply, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    return new Response(
      `Route crashed: ${err?.message ?? String(err)}\nBranch: ${wantsClaude ? "Anthropic" : "OpenAI"}`,
      { status: 500 }
    );
  }
}