// app/api/chat/route.js — CLAUDE-ONLY + DIAGNOSTICS
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const noStore = { "Cache-Control": "no-store", ...CORS };

// --- helpers ---
const mask = (v) => (v ? v.slice(0, 4) + "…" + v.slice(-4) : null);
const asText = (x) => (typeof x === "string" ? x : String(x ?? ""));

// GET = health + Anthropic reachability (no auth success required)
export async function GET() {
  const key = process.env.ANTHROPIC_API_KEY || "";
  const headers = {
    "anthropic-version": "2023-06-01",
    "x-api-key": key,
  };
  let ping = null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/models", { headers, method: "GET" });
    const body = await r.text();
    ping = { status: r.status, statusText: r.statusText, body: body.slice(0, 300) };
  } catch (e) {
    ping = { error: e.message };
  }

  return Response.json(
    {
      ok: true,
      expects: "POST { message: '...' }",
      env: {
        ANTHROPIC_API_KEY_present: !!key,
        ANTHROPIC_API_KEY_preview: mask(key),
        vercel_env: process.env.VERCEL_ENV || null,
        region: process.env.VERCEL_REGION || "unknown",
      },
      anthropic_ping: ping,
      time: new Date().toISOString(),
    },
    { headers: noStore }
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// POST = send to Claude (haiku) and return PLAIN TEXT on success, JSON on failure
export async function POST(req) {
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return Response.json({ ok: false, error: "ANTHROPIC_API_KEY missing" }, { status: 500, headers: noStore });
    }

    const body = await req.json().catch(() => ({}));
    const userText = asText(body?.message ?? body?.messages?.[0]?.content ?? "Say hi in one sentence.");
    const temperature = typeof body?.temperature === "number" ? body.temperature : 0.4;
    const max_tokens = typeof body?.max_tokens === "number" ? body.max_tokens : 256;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens,
        temperature,
        messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
      }),
    });

    const txt = await res.text();
    if (!res.ok) {
      return Response.json(
        {
          ok: false,
          provider: "anthropic",
          status: res.status,
          statusText: res.statusText,
          body: txt.slice(0, 1000),
        },
        { status: 502, headers: noStore }
      );
    }

    // success → flatten text blocks to plain text
    let out = "";
    try {
      const data = JSON.parse(txt);
      for (const block of data?.content || []) {
        if (block.type === "text" && block.text) out += block.text;
      }
    } catch {}
    return new Response(out || "Okay.", { status: 200, headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" } });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500, headers: noStore });
  }
}

