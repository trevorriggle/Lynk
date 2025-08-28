// app/api/chat/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Normalize messages array
function coerceMessages(body) {
  if (Array.isArray(body?.messages) && body.messages.length) return body.messages;
  if (body?.message) return [{ role: "user", content: String(body.message) }];
  return [];
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const messages = coerceMessages(body);

  if (!messages.length) {
    return NextResponse.json({ error: "No message provided" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Helpful, explicit error so you’re not guessing
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY env var" },
      { status: 500 }
    );
  }

  // Use a safe default OpenAI chat model
  const model = "gpt-4o-mini";
  const temperature =
    typeof body.temperature === "number" ? body.temperature : 0.4;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        // non-streaming to keep it bulletproof from the web editor
        stream: false,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { error: "OpenAI request failed", status: res.status, detail },
        { status: 500 }
      );
    }

    const data = await res.json();
    const reply =
      data?.choices?.[0]?.message?.content?.trim?.() || "Okay.";

    // Return JSON; Chat.jsx will display it (its JSON fallback path)
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json(
      { error: "Chat failed", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
