// app/api/chat/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, note: "POST { message: 'hi' } to test Claude" });
}

export async function POST(req) {
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return new Response("ANTHROPIC_API_KEY is missing", { status: 500 });
    }

    // ignore input for now, always send "Say hi"
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 20,
        messages: [{ role: "user", content: [{ type: "text", text: "Say hi" }] }],
      }),
    });

    const txt = await r.text();
    if (!r.ok) {
      // show Anthropic's complaint directly
      return new Response(`Claude ${r.status}: ${txt}`, { status: 502 });
    }

    return new Response(txt, { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(`Server error inside route: ${e.message}`, { status: 500 });
  }
}
