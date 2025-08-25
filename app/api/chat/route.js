// Next.js App Router API route: POST /api/chat
export async function POST(req) {
  try {
    const { model = "gpt-4o-mini", messages = [], temperature = 0.4 } = await req.json();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), { status: 400 });
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model, messages, temperature })
    });

    // If upstream fails, forward the message instead of returning empty
    const json = await r.json().catch(() => null);
    if (!r.ok || !json) {
      return new Response(JSON.stringify({ error: json?.error?.message || "Upstream error" }), { status: r.status || 500 });
    }

    const reply = json?.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({ reply, modelUsed: json?.model || model }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), { status: 500 });
  }
}
