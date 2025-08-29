// app/api/chat/route.js — Claude only
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
export async function GET() {
  return Response.json(
    { ok: true, provider: "anthropic", model: "claude-3-haiku-20240307" },
    { headers: CORS }
  );
}

function asText(x) {
  return typeof x === "string" ? x : String(x ?? "");
}

export async function POST(req) {
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return new Response("ANTHROPIC_API_KEY missing", { status: 500, headers: CORS });
    }

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
        model: "claude-3-haiku-20240307",
        max_tokens: 256,
        temperature: 0.4,
        messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
      }),
    });

    const txt = await r.text();
    if (!r.ok) {
      return new Response(`Claude ${r.status}: ${txt}`, { status: 502, headers: CORS });
    }

    let out = "";
    try {
      const data = JSON.parse(txt);
      for (const block of data?.content || []) {
        if (block.type === "text" && block.text) out += block.text;
      }
    } catch {}

    return new Response(out || "Okay.", {
      status: 200,
      headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return new Response(`Server error: ${e?.message}`, { status: 500, headers: CORS });
  }
}


