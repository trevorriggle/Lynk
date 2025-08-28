import { NextResponse } from "next/server";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";   // 👈 add this

const useGateway =
  !!process.env.AI_GATEWAY_URL && !!process.env.AI_GATEWAY_API_KEY;

const openai = createOpenAI({
  baseURL: useGateway ? process.env.AI_GATEWAY_URL : "https://api.openai.com/v1",
  apiKey: useGateway
    ? process.env.AI_GATEWAY_API_KEY
    : process.env.OPENAI_API_KEY,
});

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const runtime = "nodejs";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const chatMessages =
    body?.messages ??
    (body?.message ? [{ role: "user", content: body.message }] : []);

  if (!chatMessages.length) {
    return NextResponse.json({ error: "No message provided" }, { status: 400 });
  }

  const requested = (body.model || "gpt-4o-mini").toLowerCase();

  try {
    let modelFn;
    if (requested.includes("claude")) {
      // map Claude picks to valid Anthropic IDs
      const map = {
        "claude 3.5": "claude-3-5-sonnet-20240620",
        "claude sonnet": "claude-3-5-sonnet-20240620",
        "claude haiku": "claude-3-haiku-20240307",
      };
      modelFn = anthropic(map[body.model?.toLowerCase()] || "claude-3-5-sonnet-20240620");
    } else {
      // default to OpenAI
      const map = {
        "gpt-5 thinking": "gpt-4o",   // fallback
        "gpt-4o": "gpt-4o",
        "gpt-4": "gpt-4",
        "gpt-4o mini": "gpt-4o-mini",
      };
      modelFn = openai(map[body.model?.toLowerCase()] || "gpt-4o-mini");
    }

    const result = await streamText({
      model: modelFn,
      messages: chatMessages,
    });

    return result.toAIStreamResponse();
  } catch (err) {
    return NextResponse.json(
      { error: "Chat failed", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
