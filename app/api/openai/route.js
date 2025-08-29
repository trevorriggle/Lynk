// app/api/openai/route.js — OpenAI-only, does not touch your Claude route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import OpenAI from "openai";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "X-Lynk-Route": "openai",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: H });
}

// GET: quick smoke test using the SDK to prove import + key work
export async function GET() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return Response.json({ ok: false, error: "OPENAI_API_KEY missing" }, { status: 500, headers: H });
  }

  try {
    const client = new OpenAI({ apiKey: key });
    // tiny completion to prove the SDK is live (no streaming)
    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 16,
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
    });

    const text = r?.choices?.[0]?.message?.content?.toString?.().trim?.() || "";
    return Response.json({ ok: true, model_used: r?.model, text }, { headers: H });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 502, headers: H });
  }
}

// POST: send a message, return plain text (keeps Chat.jsx simple if you point to this)
export async function POST(req) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return new Response("OPENAI_API_KEY missing", { status: 500, headers: H });
  }

  let userText = "Say hi in one sentence.";
  try {
    const body = await req.json();
    const c = body?.message ?? body?.messages?.[0]?.content;
    if (c) userText = typeof c === "string" ? c : String(c);
  } catch {}

  try {
    const client = new OpenAI({ apiKey: key });
    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 256,
      temperature: 0.4,
      messages: [{ role: "user", content: userText }],
    });

    const text = r?.choices?.[0]?.message?.content?.toString?.().trim?.() || "Okay.";
    return new Response(text, { status: 200, headers: { ...H, "Content-Type": "text/plain; charset=utf-8" } });
  } catch (e) {
    return new Response(`OpenAI error: ${e?.message || String(e)}`, { status: 502, headers: H });
  }
}
