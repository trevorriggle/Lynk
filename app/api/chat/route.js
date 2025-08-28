// app/api/chat/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Coerce the request body into a proper messages array
function coerceMessages(body) {
  if (Array.isArray(body?.messages) && body.messages.length) {
    // Ensure each message has { role, content } as strings
    return body.messages.map((m) => ({
      role: m.role || "user",
      content: typeof m.content === "string" ? m.content : String(m.content ?? ""),
    }));
  }
  if (body?.message) {
    return [{ role: "user", content: String(body.message) }];
  }
  return [];
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const messages = coerceMessages(body);

  if (!messages.length) {
    return new Response("No message provided", { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response("Missing OPENAI_API_KEY", { status: 500 });
  }

  // Stable, inexpensive OpenAI chat model
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
        // non-streaming to keep this bulletproof in the web editor;
        // we still return plain text so the UI treats it like streamed text
        stream: false,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // Keep error plaintext so the client shows a readable message
      return new Response(
        `OpenAI request failed (${res.status}).\n${detail}`.trim(),
        { status: 500 }
      );
    }

    const data = await res.json();
    const reply =
      data?.choices?.[0]?.message?.content?.toString?.().trim?.() || "Okay.";

    // ✅ Return plain text so Chat.jsx renders the text directly
    return new Response(reply, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    return new Response(
      `Chat failed: ${err?.message ?? String(err)}`,
      { status: 500 }
    );
  }
}

}
