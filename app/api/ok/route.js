// app/api/ok/route.js
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    usingGateway: !!process.env.AI_GATEWAY_URL && !!process.env.AI_GATEWAY_API_KEY,
    hasOpenAIKey: !!process.env.OPENAI_API_KEY,
  });
}
