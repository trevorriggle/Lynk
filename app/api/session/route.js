// app/api/session/route.js — gated BG (>=5), stable snapshots, topic commands on every 3 mentions, smart counts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

// CORS / headers
const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "X-Lynk-Route": "session",
};

// Identity
const APP_NAME = "Lynk";
function buildIdentitySystemPrompt({ appName, provider, modelName }) {
  return [
    `${appName} system identity`,
    `- You are "${appName}" - an AI interface that routes conversations through multiple large language models.`,
    `- For THIS conversation, your current underlying model is: provider="${provider}", model="${modelName}".`,
    `- If asked about your identity, reply: "I'm ${appName}. This chat is currently powered by ${provider} ${modelName} via ${appName}."`,
    `- You can switch between OpenAI, Anthropic, Google/Gemini, xAI, and other providers mid-conversation.`,
    `- Refer to yourself as "${appName}".`,
  ].join("\n");
}

// Budgets / models
const INPUT_TOKEN_BUDGET = 1000;
const OUTPUT_TOKENS = 600;
const LIVE_NOTES_BUDGET = 400;
const LIVE_NOTES_TOKENS = 64;
const SNAPSHOT_INPUT_BUDGET = 500;
const SNAPSHOT_OUTPUT_TOKENS = 128;
const BACKGROUND_MODEL = "gpt-4o-mini";
const BACKGROUND_TEMP = 0.1;
const estTokens = (s) => Math.ceil((s || "").length / 4);

// Sessions
const SESSIONS = new Map();
function getSession(id, userId = null) {
  const key = userId ? `${userId}:${id}` : `guest:${id}`;
  if (!SESSIONS.has(key)) {
    SESSIONS.set(key, {
      turns: [],
      last: {},
      live: { gist: "", key_points: [], todos: [], entities: [] },
      topicCounts: {},         // total mentions per topic (used for 3x rule)
      commands: [],            // suggestions list
      snapshots: [],
      userId,
      isGuest: !userId,
      _topicSeenAt: {},
      commandState: {},
    });
  }
  return SESSIONS.get(key);
}

// Auth
async function getUserFromRequest(req) {
  try {
    const cookies = req.headers.get("cookie");
    if (!cookies) return null;
    const { origin } = new URL(req.url);
    const base = process.env.NEXTAUTH_URL || origin;
    const r = await fetch(`${base}/api/me`, { headers: { cookie: cookies }, cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      return j.userId || null;
    }
    return null;
  } catch (e) {
    console.warn("getUserFromRequest failed:", e);
    return null;
  }
}

// Helpers
const asText = (x) => (typeof x === "string" ? x : String(x ?? ""));
function shouldInjectIdentity(message) {
  const triggers = [/(^|\b)(who are you|what are you|what model|what ai|what is lynk)(\b)/i];
  return triggers.some((re) => re.test(message || ""));
}
function buildBudgetedTurns(turns, maxTokens) {
  const out = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    const cost = estTokens(t.content) + 4;
    if (used + cost > Math.max(64, Math.floor(maxTokens * 0.95))) break;
    out.unshift(t);
    used += cost;
  }
  return out;
}
const userTurnCount = (turns) => turns.reduce((n, t) => (t.role === "user" ? n + 1 : n), 0);
function buildOpenAIMessages(turns) {
  return buildBudgetedTurns(turns, INPUT_TOKEN_BUDGET).map((t) => ({
    role: t.role === "assistant" ? "assistant" : "user",
    content: t.content,
  }));
}
function buildAnthropicMessages(turns) {
  return buildBudgetedTurns(turns, INPUT_TOKEN_BUDGET).map((t) => ({
    role: t.role === "assistant" ? "assistant" : "user",
    content: [{ type: "text", text: t.content }],
  }));
}
function buildGeminiHistory(turns) {
  return buildBudgetedTurns(turns, INPUT_TOKEN_BUDGET).map((t) => ({
    role: t.role === "assistant" ? "model" : "user",
    parts: [{ text: t.content }],
  }));
}
async function callOpenAICompatible({ baseURL, key, model, messages, max_tokens = OUTPUT_TOKENS, temperature = 0.4 }) {
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, temperature, max_tokens }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`OpenAI-compatible ${res.status}: ${txt}`);
  const data = JSON.parse(txt);
  return data?.choices?.[0]?.message?.content?.toString?.() || "Okay.";
}

// Topic detection + 3x rule for commands
function trackMessageTopics(session, message) {
  if (!message || typeof message !== "string") return;

  const patterns = {
    ai: /\b(ai|artificial intelligence|machine learning|ml|llm|model|claude|openai|gpt)\b/i,
    programming: /\b(code|coding|programming|javascript|python|react|api|development|software)\b/i,
    business: /\b(business|strategy|revenue|cost|optimization|market|sales|customer)\b/i,
    data: /\b(data|database|sql|analytics|metrics|statistics|analysis)\b/i,
    design: /\b(design|ui|ux|interface|user experience|frontend|styling)\b/i,
    project: /\b(project|task|deadline|planning|management|timeline)\b/i,
  };

  // numbers trigger
  const msg = message.trim();
  const numbers =
    /^[\s\d]+$/.test(msg) ||
    /\b(count|counting|sequence|sequential|next number|increment)\b/i.test(msg) ||
    /(?:^|\s)\d+(?:[\s,]+\d+){2,}\s*$/.test(msg);

  const hits = new Set();
  for (const [topic, re] of Object.entries(patterns)) {
    if (re.test(message)) hits.add(topic);
  }
  if (numbers) hits.add("numbers");

  // update mention counts and add commands at 3x, 6x, 9x...
  for (const topic of hits) {
    session.topicCounts[topic] = (session.topicCounts[topic] || 0) + 1;
    const count = session.topicCounts[topic];

    if (count % 3 === 0) {
      if (!session.commands) session.commands = [];
      const add = (label) =>
        session.commands.push({
          slug: topic,
          command: label,
          created_at: new Date().toISOString(),
          confidence: "med",
        });

      if (topic === "numbers") {
        add("numbers?");
        add("continue counting");
        add("analyze the sequence");
      } else {
        add(`tell me more about ${topic}`);
      }
    }
  }
}

// BG: live notes
async function updateLiveNotesUltraCheap(session) {
  if (session.isGuest) return;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return;

  const lastTurns = buildBudgetedTurns(session.turns, LIVE_NOTES_BUDGET);
  const chatExcerpt = lastTurns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join("\n");
  const prompt = `Update live notes. Return JSON: {"gist":"","key_points":[],"todos":[],"entities":[]}\n\n${chatExcerpt}`;

  try {
    const client = new OpenAI({ apiKey: key });
    const r = await client.chat.completions.create({
      model: BACKGROUND_MODEL,
      max_tokens: LIVE_NOTES_TOKENS,
      temperature: BACKGROUND_TEMP,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = r?.choices?.[0]?.message?.content?.toString?.() || "{}";
    const obj = JSON.parse(extractJson(raw));
    mergeLive(session, obj);
  } catch (e) {
    console.warn("live notes failed:", e.message);
  }
}

// BG: snapshot
async function consolidateSnapshotUltraCheap(session) {
  if (session.isGuest) return;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return;

  const from_turn = (session.snapshots?.at(-1)?.to_turn ?? 0) + 1;
  const to_turn = session.turns.length;
  const windowTurns = session.turns.slice(Math.max(0, from_turn - 1), to_turn);

  const excerpt = buildBudgetedTurns(windowTurns, SNAPSHOT_INPUT_BUDGET)
    .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
    .join("\n");

  const prompt =
    `Summarize chat. Return JSON: {"topics":[{"slug":"","gloss":""}],"key_details":[],"decisions":[],"open_questions":[],"actions":[],"confidence":"med"}\n\n${excerpt}`;

  try {
    const client = new OpenAI({ apiKey: key });
    const r = await client.chat.completions.create({
      model: BACKGROUND_MODEL,
      temperature: BACKGROUND_TEMP,
      max_tokens: SNAPSHOT_OUTPUT_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });
    const jsonText = r?.choices?.[0]?.message?.content?.toString?.() || "{}";
    const obj = JSON.parse(extractJson(jsonText)) || {};

    const snapshot = {
      created_at: new Date().toISOString(),
      model: { provider: "openai", model: BACKGROUND_MODEL },
      from_turn,
      to_turn,
      topics: (obj.topics || []).slice(0, 4),
      key_details: (obj.key_details || []).slice(0, 4),
      decisions: (obj.decisions || []).slice(0, 3),
      open_questions: (obj.open_questions || []).slice(0, 3),
      actions: (obj.actions || []).slice(0, 3),
      confidence: obj.confidence || "med",
    };

    (session.snapshots ||= []).push(snapshot);
  } catch (e) {
    console.warn("snapshot failed:", e.message);
  }
}

function mergeLive(session, obj) {
  const live = session.live || (session.live = { gist: "", key_points: [], todos: [], entities: [] });
  if (typeof obj?.gist === "string") live.gist = obj.gist;
  if (Array.isArray(obj?.key_points)) live.key_points = obj.key_points.slice(0, 3);
  if (Array.isArray(obj?.todos)) live.todos = obj.todos.slice(0, 3);
  if (Array.isArray(obj?.entities)) live.entities = obj.entities.slice(0, 3);
}
function extractJson(s) {
  const str = (s || "").trim();
  const start = str.indexOf("{");
  const end = str.lastIndexOf("}");
  if (start >= 0 && end > start) return str.slice(start, end + 1);
  return "{}";
}
function runWithTimeout(p, ms = 2000, label = "task") {
  let id;
  const t = new Promise((_, rej) => (id = setTimeout(() => rej(new Error(`Timeout: ${label}`)), ms)));
  return Promise.race([p.finally(() => clearTimeout(id)), t]);
}

// OPTIONS
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: H });
}

// GET (poll)
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const userId = await getUserFromRequest(req);

  if (sessionId) {
    const vKey = userId ? `${userId}:${sessionId}` : null;
    const gKey = `guest:${sessionId}`;
    const s = (vKey ? SESSIONS.get(vKey) : null) || SESSIONS.get(gKey);

    return Response.json(
      s
        ? {
            ok: true,
            inspector: { live: s.live, snapshots: s.snapshots || [], commands: s.commands || [], topicCounts: s.topicCounts || {} },
            turns: s.turns.length,
            isGuest: s.isGuest,
            userId: s.userId,
          }
        : { ok: false, error: "session not found" },
      { headers: H }
    );
  }

  return Response.json({ ok: true, sessions: SESSIONS.size, userId: userId || "guest" }, { headers: H });
}

// POST (main)
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    let message = asText(body?.message ?? "");
    if (!message) return new Response("Missing message", { status: 400, headers: H });

    let sessionId = asText(body?.sessionId || "");
    if (!sessionId) sessionId = crypto.randomUUID?.() || "sess_" + Math.random().toString(36).slice(2);

    const userId = await getUserFromRequest(req);

    // Merge guest → verified
    if (userId) {
      const gKey = `guest:${sessionId}`;
      const vKey = `${userId}:${sessionId}`;
      if (SESSIONS.has(gKey) && !SESSIONS.has(vKey)) {
        const guest = SESSIONS.get(gKey);
        guest.userId = userId;
        guest.isGuest = false;
        SESSIONS.set(vKey, guest);
        SESSIONS.delete(gKey);
      }
    }

    const modelMeta = body?.model || {};
    const provider = asText(modelMeta?.provider || "anthropic");
    const modelName = asText(
      modelMeta?.model ||
        (provider === "openai"
          ? "gpt-4o-mini"
          : provider === "gemini"
          ? "gemini-1.5-flash"
          : provider === "xai"
          ? "grok-2"
          : "claude-3-haiku-20240307")
    );

    const needsIdentity = shouldInjectIdentity(message);
    const systemIdentity = needsIdentity ? buildIdentitySystemPrompt({ appName: APP_NAME, provider, modelName }) : null;

    const s = getSession(sessionId, userId);
    s.turns.push({ role: "user", content: message, provider, model: modelName });

    // Provider call
    let assistantText = "";
    if (provider === "xai") {
      const key = process.env.XAI_API_KEY;
      if (!key) return new Response("XAI_API_KEY missing", { status: 500, headers: H });
      const messages = needsIdentity ? [{ role: "system", content: systemIdentity }, ...buildOpenAIMessages(s.turns)] : buildOpenAIMessages(s.turns);
      assistantText = await callOpenAICompatible({ baseURL: "https://api.x.ai/v1", key, model: modelName, messages, max_tokens: OUTPUT_TOKENS, temperature: 0.4 });
    } else if (provider === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return new Response("OPENAI_API_KEY missing", { status: 500, headers: H });
      const client = new OpenAI({ apiKey: key });
      const messages = needsIdentity ? [{ role: "system", content: systemIdentity }, ...buildOpenAIMessages(s.turns)] : buildOpenAIMessages(s.turns);
      const r = await client.chat.completions.create({ model: modelName, max_tokens: OUTPUT_TOKENS, temperature: 0.4, messages });
      assistantText = r?.choices?.[0]?.message?.content?.toString?.() || "Okay.";
    } else if (provider === "anthropic") {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return new Response("ANTHROPIC_API_KEY missing", { status: 500, headers: H });
      const reqBody = { model: modelName, max_tokens: OUTPUT_TOKENS, temperature: 0.4, messages: buildAnthropicMessages(s.turns), ...(needsIdentity ? { system: systemIdentity } : {}) };
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": key },
        body: JSON.stringify(reqBody),
      });
      const txt = await r.text();
      if (!r.ok) return new Response(`Claude ${r.status}: ${txt}`, { status: 502, headers: H });
      try {
        const data = JSON.parse(txt);
        assistantText = (data?.content || []).filter((b) => b?.type === "text").map((b) => b.text).join("") || "Okay.";
      } catch {
        assistantText = txt || "Okay.";
      }
    } else {
      const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!key) return new Response("GEMINI_API_KEY missing", { status: 500, headers: H });
      const genAI = new GoogleGenerativeAI(key);
      const cfg = { model: modelName || "gemini-1.5-flash" };
      if (needsIdentity) cfg.systemInstruction = systemIdentity;
      const model = genAI.getGenerativeModel(cfg);
      const history = buildGeminiHistory(s.turns);
      const result = await model.generateContent({ contents: history, generationConfig: { maxOutputTokens: OUTPUT_TOKENS, temperature: 0.4 } });
      assistantText = result?.response?.text?.() || "Okay.";
    }

    s.turns.push({ role: "assistant", content: assistantText, provider, model: modelName });
    s.last = { provider, model: modelName };

    // BG after 5+ user turns (verified only)
    const uCount = userTurnCount(s.turns);
    if (!s.isGuest && uCount >= 5) {
      runWithTimeout(updateLiveNotesUltraCheap(s), 2000, "live-notes").catch(() => {});
      trackMessageTopics(s, message); // 3x rule
      if (uCount % 5 === 0) runWithTimeout(consolidateSnapshotUltraCheap(s), 2000, "snapshot").catch(() => {});
    }

    const responseData = {
      text: assistantText,
      inspector: {
        live: s.live,
        snapshots: s.snapshots || [],
        commands: s.commands || [],
        topicCounts: s.topicCounts || {},
      },
      sessionMeta: { isGuest: s.isGuest, userId: s.userId, provider, model: modelName },
    };

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { ...H, "Content-Type": "application/json; charset=utf-8", "X-Session-Id": sessionId },
    });
  } catch (e) {
    console.error("Session error:", e);
    return new Response(`Session error: ${e?.message || String(e)}`, { status: 500, headers: H });
  }
}
