// app/api/claude/route.js — brand-new, Claude-only endpoint with a loud marker
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "X-Lynk-Route": "claude",
  "X-Lynk-Marker": "claude-endpoint-active",
};

const asText = (x) => (typeof x === "string" ? x : String(x ?? ""));

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: H });
}

export async function GET() {
  const present = !!process.env.ANTHROPIC_API_KEY;
  return Response.json(
    {
      ok: true,
      expects: "POST { message: '...' }",
      provider: "anthropic",
      model_default: "claude-3-haiku-20240307",
      key_present: present,
      marker: "claude-endpoint-active",
      time: new Date().toISOString(),
    },
    { headers: H }
  );
}

export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return new Response("ANTHROPIC_API_KEY missing", { status: 500, headers: H });
  }
  let userText = "Say hi in one sentence.";
  try {
    const body = await req.json();
    const c = body?.message ?? body?.messages?.[0]?.content;
    if (c) userText = typeof c === "string" ? c : String(c);
  } catch { /* ignore parse errors */ }

  try {
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
      return new Response(`Claude ${r.status}: ${txt}`, { status: 502, headers: H });
    }

    // flatten blocks → plain text for bubble
    let out = "";
    try {
      const data = JSON.parse(txt);
      for (const b of data?.content || []) if (b?.type === "text" && b?.text) out += b.text;
    } catch {}
    return new Response(out || "Okay.", { status: 200, headers: { ...H, "Content-Type": "text/plain; charset=utf-8" } });
  } catch (e) {
    return new Response(`Server crash: ${e?.message || String(e)}`, { status: 500, headers: H });
  }
}
