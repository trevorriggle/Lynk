// app/api/chat/route.js
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

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const chatMessages =
    body?.messages ??
    (body?.message ? [{ role: "user", content: body.message }] : []);

  if (!chatMessages.length) {
    return NextResponse.json({ error: "No message provided" }, { status: 400 });
  }

  try {
    const result = await streamText({
      model: openai(body.model || "gpt-4o-mini"),
      messages: chatMessages,
    });

    // 👇 This sends back *just the text stream* (not JSON)
    return result.toAIStreamResponse();
  } catch (err) {
    return NextResponse.json(
      { error: "Chat failed", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
