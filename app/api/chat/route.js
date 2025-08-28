// app/api/chat/route.js
import { NextResponse } from "next/server";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const useGateway =
  !!process.env.AI_GATEWAY_URL && !!process.env.AI_GATEWAY_API_KEY;

const openai = createOpenAI({
  baseURL: useGateway ? process.env.AI_GATEWAY_URL : "https://api.openai.com/v1",
  apiKey: useGateway ? process.env.AI_GATEWAY_API_KEY : process.env.OPENAI_API_KEY,
});

export const runtime = "nodejs";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));

  const messages =
    body?.messages ??
    (body?.message ? [{ role: "user", content: body.message }] : []);

  if (!messages.length) {
    return NextResponse.json({ error: "No message provided" }, { status: 400 });
  }

  // Use any OpenAI Chat model; mini is cheap & streams well
  const modelId = "gpt-4o-mini";

  try {
    const result = await streamText({
      model: openai(modelId),
      messages,
      temperature: typeof body.temperature === "number" ? body.temperature : 0.4,
    });
    return result.toAIStreamResponse(); // streams plain text
  } catch (err) {
    return NextResponse.json(
      { error: "Chat failed", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
