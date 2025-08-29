// app/api/chat/route.js
export const runtime = "nodejs";

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

/* ---------- helpers ---------- */

function splitSystemAndMsgs(raw = []) {
  const sysParts = raw.filter(m => m.role === "system").map(m => String(m.content ?? ""));
  const system = sysParts.length ? sysParts.join("\n\n") : undefined;
  const rest = raw.filter(m => m.role !== "system");
  return { system, msgs: rest };
}

function toOpenAIMessages(body) {
  if (Array.isArray(body?.messages) && body.messages.length) {
    // keep system | user | assistant
    return body.messages.map(m => ({
      role: m.role || "user",
      content: typeof m.content === "string" ? m.content : String(m?.content ?? "")
    }));
  }
  if (body?.message) return [{ role: "user", content: String(body.message) }];
  return [];
}

function toAnthropicPayload(body) {
  // Anthropic: system string + messages [{role:user|assistant, content:[{type:"text", text}]}]
  const raw = Array.isArray(body?.messages) ? body.messages : (body?.message ? [{ role:"user", content:String(body.message) }] : []);
  const { system, msgs } = splitSystemAndMsgs(raw);

  const messages = msgs.map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: [{ type: "text", text: typeof m.content === "string" ? m.content : String(m?.content ?? "") }]
  }));

  return { system, messages };
}

function isAnthropicRequested(model = "", provider = "") {
  const m = (model || "").toLowerCase();
  const p = (provider || "").toLowerCase();
  return p === "anthropic" || m.includes("claude");
}

/* ---------- route ---------- */

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    const model = String(body?.model ?? "").trim();
    const provider = String(body?.provider ?? "").trim();
    const temperature = typeof body?.temperature === "number" ? body.temperature : 0.4;
    const max_tokens = typeof body?.max_tokens === "number" ? body.max_tokens : 1024;

    // ---------- Anthropic ----------
    if (isAnthropicRequested(model, provider)) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return new Response("ANTHROPIC_API_KEY not configured", { status: 500 });

      const anthropic = new Anthropic({ apiKey });

      const { system, messages } = toAnthropicPayload(body);
      if (!messages.length) return new Response("No message provided", { status: 400 });

      const chosen = model && model.toLowerCase().includes("claude")
        ? model
        : "claude-3-5-sonnet-latest";

      const resp = await anthropic.messages.create({
        model: chosen,
        max_tokens,
        temperature,
        ...(system ? { system } : {}),
        messages
      });

      // flatten first text block
      let text = "";
      for (const block of resp.content || []) {
        if (block.type === "text" && block.text) text += block.text;
      }
      return new Response(text || "Okay.", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    // ---------- OpenAI ----------
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return new Response("OPENAI_API_KEY not configured", { status: 500 });

    const openai = new OpenAI({ apiKey: openaiKey });

    const messages = toOpenAIMessages(body);
    if (!messages.length) return new Response("No message provided", { status: 400 });

    const chosen = model && model.toLowerCase().startsWith("gpt")
      ? model
      : "gpt-4o-mini";

    const result = await openai.chat.completions.create({
      model: chosen,
      messages,
      temperature,
      max_tokens,
      stream: false
    });

    const reply = result?.choices?.[0]?.message?.content?.toString?.().trim?.() || "Okay.";
    return new Response(reply, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });

  } catch (err) {
    return new Response(`Server error: ${err?.message || String(err)}`, { status: 500 });
  }
}
