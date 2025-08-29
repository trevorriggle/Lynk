// app/api/chat/route.js — Claude only, with GET/POST/OPTIONS
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET() {
  // simple health so GET never 405s
  return Response.json(
    { ok: true, expects: "POST { message: '...' }", provider: "anthropic", model: "claude-3-haiku-20240307" },
    { headers: CORS }
  );
}

function asText(x) { return typeof x === "string" ? x : String(x ?? ""); }

export async function POST(req) {
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return new Response("ANTHROPIC_API_KEY missing", { status: 500, headers: CORS });

    const body = await req.json().catch(() => ({}));
    const userText = asText(body?.message ?? body?.messages?.[0]?.content ?? "Say hi in one sentence.");

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",      // safe default
        max_tokens: 256,
        temperature: 0.4,
        messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
      }),
    });

    const txt = await r.text();
    if (!r.ok) return new Response(`Claude ${r.status}: ${txt}`, { status: 502, headers: CORS });

    // flatten text blocks → return plain text for chat bubble
    let out = "";
    try {
      const data = JSON.parse(txt);
      for (const b of data?.content || []) if (b.type === "text" && b.text) out += b.text;
    } catch {}
    return new Response(out || "Okay.", { status: 200, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } });
  } catch (e) {
    return new Response(`Server error: ${e?.message || String(e)}`, { status: 500, headers: CORS });
  }
}
