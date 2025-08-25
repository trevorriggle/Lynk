export async function POST(req) {
  try {
    const { model = "gpt-4o-mini", messages = [], temperature = 0.4 } = await req.json();

    // Allow header override for quick curl tests, otherwise use server env.
    const headerKey = (req.headers.get("x-openai-key") || "").trim();
    const apiKey = process.env.OPENAI_API_KEY || headerKey;
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

    const json = await r.json();
    if (!r.ok) {
      return new Response(
        JSON.stringify({ error: json?.error?.message || "Upstream error" }),
        { status: r.status }
      );
    }

    const reply = json?.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({ reply }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
