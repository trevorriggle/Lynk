// app/api/chat/route.js
export const runtime = "nodejs";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));

  const msg = body?.message || (body?.messages?.[0]?.content ?? "Hello");
  const provider = (body?.provider || "").toLowerCase();

  try {
    // --- Claude ---
    if (provider === "anthropic" || (body?.model || "").toLowerCase().includes("claude")) {
      if (!process.env.ANTHROPIC_API_KEY) {
        return new Response("ANTHROPIC_API_KEY missing", { status: 500 });
      }
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-latest",
          max_tokens: 256,
          messages: [{ role: "user", content: [{ type: "text", text: String(msg) }] }],
        }),
      });
      const txt = await r.text();
      if (!r.ok) return new Response(`Claude ${r.status}: ${txt}`, { status: 502 });
      const data = JSON.parse(txt);
      return new Response(data.content?.[0]?.text || "Okay.");
    }

    // --- GPT ---
    if (!process.env.OPENAI_API_KEY) {
      return new Response("OPENAI_API_KEY missing", { status: 500 });
    }
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: String(msg) }],
        max_tokens: 256,
      }),
    });
    const txt = await r.text();
    if (!r.ok) return new Response(`OpenAI ${r.status}: ${txt}`, { status: 502 });
    const data = JSON.parse(txt);
    return new Response(data.choices?.[0]?.message?.content || "Okay.");
  } catch (e) {
    return new Response(`Server error: ${e.message}`, { status: 500 });
  }
}
