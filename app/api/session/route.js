// app/api/session/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import OpenAI from "openai";

// --- CORS / headers ---
const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "X-Lynk-Route": "session",
};

// --- cost guards ---
const INPUT_TOKEN_BUDGET = 1500; // ~cheap context window
const OUTPUT_TOKENS = 256;       // reply cap
const estTokens = (s) => Math.ceil((s || "").length / 4);

// --- Minimal in-memory session store ---
// Session: { turns, last, live, topicCounts, commands, snapshots? }
const SESSIONS = new Map();
const getSession = (id) => {
  if (!SESSIONS.has(id)) {
    SESSIONS.set(id, {
      turns: [],
      last: {},
      live: { gist: "", key_points: [], todos: [], entities: [] },
      topicCounts: {},
      commands: [],
      snapshots: [],
    });
  }
  return SESSIONS.get(id);
};

// --- helpers ---
const asText = (x) => (typeof x === "string" ? x : String(x ?? ""));
const buildBudgetedTurns = (turns, maxTokens) => {
  const out = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    const cost = estTokens(t.content) + 4; // overhead
    if (used + cost > maxTokens) break;
    out.unshift(t);
    used += cost;
  }
  return out;
};

// Build messages for OpenAI (chat.completions)
function buildOpenAIMessages(turns) {
  return buildBudgetedTurns(turns, INPUT_TOKEN_BUDGET).map((t) => ({
    role: t.role === "assistant" ? "assistant" : "user",
    content: t.content,
  }));
}

// Build messages for Anthropic (Messages API)
function buildAnthropicMessages(turns) {
  return buildBudgetedTurns(turns, INPUT_TOKEN_BUDGET).map((t) => ({
    role: t.role === "assistant" ? "assistant" : "user",
    content: [{ type: "text", text: t.content }],
  }));
}

// ---------- Live Notes + Topics -> Commands ----------

async function updateLiveNotes(session, provider, modelName) {
  // Keep summarization input extra small
  const lastTurns = buildBudgetedTurns(session.turns, 600);
  const chatExcerpt = lastTurns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join("\n");

  const prompt =
    [
      "You are the Inspector. Update live notes for this chat turn.",
      "Return STRICT JSON with keys:",
      '  - "gist": (string, <= 1 sentence)',
      '  - "key_points": (array, <= 4 short bullets)',
      '  - "todos": (array of strings, empty if none)',
      '  - "entities": (array of short labels/names)',
      '  - "topics": (array of short, lowercase slugs; hyphenate multiword, e.g., "fort-rapids")',
      "",
      "Respond with JSON only. No prose.",
      "",
      "Chat excerpt:",
      chatExcerpt,
    ].join("\n");

  // You can force the cheapest summarizer no matter what pill is selected:
  // provider = "openai"; modelName = "gpt-4o-mini";

  try {
    if (provider === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return;
      const client = new OpenAI({ apiKey: key });
      const r = await client.chat.completions.create({
        model: modelName,
        max_tokens: 128,
        temperature: 0.2,
        messages: [
          { role: "system", content: "Return only valid JSON. No explanations." },
          { role: "user", content: prompt },
        ],
      });
      const raw = r?.choices?.[0]?.message?.content?.toString?.() || "";
      const obj = JSON.parse(extractJson(raw));
      mergeLive(session, obj);
    } else {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return;
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: 128,
          temperature: 0.2,
          messages: [{ role: "user", content: [{ type: "text", text: "Return only valid JSON. No explanations.\n\n" + prompt }] }],
        }),
      });
      const txt = await r.text();
      const data = safeParseJson(txt); // Anthropics outer envelope
      const onlyText = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
      const obj = JSON.parse(extractJson(onlyText));
      mergeLive(session, obj);
    }
  } catch {
    // If summarizer fails, keep prior live notes
  }
}

function extractJson(s) {
  const str = (s || "").trim();
  const start = str.indexOf("{");
  const end = str.lastIndexOf("}");
  if (start >= 0 && end > start) return str.slice(start, end + 1);
  return "{}";
}
function safeParseJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function mergeLive(session, obj) {
  const live = session.live || (session.live = { gist: "", key_points: [], todos: [], entities: [] });

  if (typeof obj?.gist === "string") live.gist = obj.gist;
  if (Array.isArray(obj?.key_points)) live.key_points = obj.key_points.slice(0, 4);
  if (Array.isArray(obj?.todos)) live.todos = obj.todos.slice(0, 8);
  if (Array.isArray(obj?.entities)) live.entities = obj.entities.slice(0, 8);

  // NEW: topics -> counts -> suggested commands
  if (Array.isArray(obj?.topics)) {
    for (const raw of obj.topics) {
      const slug = normalizeSlug(raw);
      if (!slug) continue;
      session.topicCounts[slug] = (session.topicCounts[slug] || 0) + 1;
      maybeSuggestCommand(session, slug);
    }
  }
}

function normalizeSlug(v) {
  if (!v) return "";
  const s = String(v).trim().toLowerCase();
  return s
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const COMMAND_THRESHOLD = 10; // “more than 10 messages” → suggest at 10+
function maybeSuggestCommand(session, slug) {
  const n = session.topicCounts[slug] || 0;
  if (n < COMMAND_THRESHOLD) return;
  const cmd = `${slug}?`;
  const exists = (session.commands || []).some((c) => c.slug === slug);
  if (!exists) {
    (session.commands ||= []).push({ slug, command: cmd, count: n, created_at: new Date().toISOString() });
  } else {
    const item = session.commands.find((c) => c.slug === slug);
    if (item) item.count = n;
  }
}

// --- preflight ---
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: H });
}

// --- simple health/debug ---
export async function GET() {
  return Response.json(
    {
      ok: true,
      sessions: SESSIONS.size,
      now: new Date().toISOString(),
      expects: "POST { sessionId, message, model: { label, provider, model } }",
    },
    { headers: H }
  );
}

// --- main POST ---
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    let message = asText(body?.message ?? body?.messages?.[0]?.content ?? "");
    if (!message) return new Response("Missing message", { status: 400, headers: H });

    // session id
    let sessionId = asText(body?.sessionId || "");
    if (!sessionId) {
      try {
        sessionId = crypto.randomUUID();
      } catch {
        sessionId = "sess_" + Math.random().toString(36).slice(2);
      }
    }

    // model meta from the pill
    const modelMeta = body?.model || {};
    const provider = asText(modelMeta?.provider || "anthropic");
    const modelName = asText(modelMeta?.model || (provider === "openai" ? "gpt-4o-mini" : "claude-3-haiku-20240307"));

    // 1) append user turn
    const s = getSession(sessionId);
    s.turns.push({ role: "user", content: message, provider, model: modelName });

    // 2) call chosen provider with recent context
    let assistantText = "";
    if (provider === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return new Response("OPENAI_API_KEY missing", { status: 500, headers: H });

      const client = new OpenAI({ apiKey: key });
      const r = await client.chat.completions.create({
        model: modelName,
        max_tokens: OUTPUT_TOKENS,
        temperature: 0.4,
        messages: buildOpenAIMessages(s.turns),
      });
      assistantText = r?.choices?.[0]?.message?.content?.toString?.() || "Okay.";
    } else {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return new Response("ANTHROPIC_API_KEY missing", { status: 500, headers: H });

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: OUTPUT_TOKENS,
          temperature: 0.4,
          messages: buildAnthropicMessages(s.turns),
        }),
      });
      const txt = await r.text();
      if (!r.ok) return new Response(`Claude ${r.status}: ${txt}`, { status: 502, headers: H });

      try {
        const data = JSON.parse(txt);
        for (const b of data?.content || []) if (b?.type === "text" && b?.text) assistantText += b.text;
      } catch {
        assistantText = txt || "Okay.";
      }
    }

    // 3) append assistant turn
    s.turns.push({ role: "assistant", content: assistantText, provider, model: modelName });
    s.last = { provider, model: modelName };

    // 4) update inspector live notes (cheap)
    await updateLiveNotes(s, provider, modelName);

    // 5) return JSON: assistant + inspector
    return new Response(
      JSON.stringify({
        text: assistantText,
        inspector: {
          live: s.live,
          snapshots: s.snapshots || [],
          commands: s.commands || [],
        },
      }),
      {
        status: 200,
        headers: { ...H, "Content-Type": "application/json; charset=utf-8", "X-Session-Id": sessionId },
      }
    );
  } catch (e) {
    return new Response(`Session error: ${e?.message || String(e)}`, { status: 500, headers: H });
  }
}

