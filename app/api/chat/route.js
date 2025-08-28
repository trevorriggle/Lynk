import { NextResponse } from "next/server";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const useGateway =
  !!process.env.AI_GATEWAY_URL && !!process.env.AI_GATEWAY_API_KEY;

const openai = createOpenAI({
  baseURL: useGateway ? process.env.AI_GATEWAY_URL : "https://api.openai.com/v1",
  apiKey: useGateway
    ? process.env.AI_GATEWAY_API_KEY
    : process.env.OPENAI_API_KEY,
});

export const runtime = "nodejs";

// Minimal mapper from your pill labels → provider model IDs
function mapModel(label = "") {
  const key = label.toLowerCase();

  // Anthropic
  if (key.includes("claude")) {
    if (key.includes("haiku")) return { provider: "anthropic", id: "claude-3-haiku-20240307" };
    // Default Anthropic = Claude 3.5 Sonnet
    return { provider: "anthropic", id: "claude-3-5-sonnet-20240620" };
  }

  // OpenAI (defaults)
  if (key.includes("gpt-4o mini")) return { provider: "openai", id: "gpt-4o-mini" };
  if (key.includes("gpt-4o")) return { provider: "openai", id: "gpt-4o" };
  if (key.includes("gpt-4")) return { provider: "openai", id: "gpt-4" };

  // Fallback
  return { provider: "openai", id: "gpt-4o-mini" };
}

// Convert Vercel AI SDK-style messages to Anthropic Messages API format
function toAnthropicMessages(vercelMessages = []) {
  // Anthropic expects an array of {role:"user"|"assistant", content:[{type:"text",text:"..."}]}
  // We'll drop any 'system' role here for simplicity.
  return vercelMessages
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => ({
      role: m.role,
      content: [{ type: "text", text: String(m.content ?? "") }],
    }));
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const chatMessages =
    body?.messages ??
    (body?.message ? [{ role: "user", content: body.message }] : []);

  if (!chatMessages.length) {
    return NextResponse.json({ error: "No message provided" }, { status: 400 });
  }

  const { provider, id: modelId } = mapModel(body.model);

  try {
    if (provider === "anthropic") {
      // ---- Claude via REST (JSON, not streaming) ----
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "Anthropic key missing" },
          { status: 500 }
        );
      }

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelId,
          // temperature optional; you pass 0.4 from client
          temperature: typeof body.temperature === "number" ? body.temperature : 0.4,
          max_tokens: 1024,
          messages: toAnthropicMessages(chatMessages),
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return NextResponse.json(
          { error: "Claude request failed", detail },
          { status: res.status }
        );
      }

      const data = await res.json();
      // Anthropic returns: { content: [{type:'text', text:'...'}], ... }
      const reply =
        Array.isArray(data?.content) && data.content[0]?.text
          ? data.content[0].text
          : "Okay.";

      // Return JSON so the client uses its non-streaming fallback
      return NextResponse.json({ reply });
    }

    // ---- OpenAI streaming via Vercel AI SDK ----
    const result = await streamText({
      model: openai(modelId || "gpt-4o-mini"),
      messages: chatMessages,
      temperature: typeof body.temperature === "number" ? body.temperature : 0.4,
    });

    return result.toAIStreamResponse();
  } catch (err) {
    return NextResponse.json(
      { error: "Chat failed", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
