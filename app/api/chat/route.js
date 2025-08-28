// app/api/chat/route.js
import { NextResponse } from "next/server";

const useGateway =
  !!process.env.AI_GATEWAY_URL && !!process.env.AI_GATEWAY_API_KEY;

const BASE_URL = useGateway ? process.env.AI_GATEWAY_URL : "https://api.openai.com/v1";
const API_KEY = useGateway
  ? process.env.AI_GATEWAY_API_KEY
  : process.env.OPENAI_API_KEY;

export const runtime = "nodejs";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const messages =
    body?.messages ??
    (body?.message ? [{ role: "user", content: body.message }] : []);

  if (!messages.length) {
    return NextResponse.json({ error: "No message provided" }, { status: 400 });
  }
  if (!API_KEY) {
    // Safe echo fallback if misconfigured
    const last = messages[messages.length - 1]?.content ?? "";
    return NextResponse.json({ reply: last, note: "No API key configured" });
  }

  try {
    const resp = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        // temperature: 0.7,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: "Provider error", detail: text }, { status: 502 });
    }
    const data = await resp.json();
    const reply = data?.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json(
      { error: "Chat failed", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
