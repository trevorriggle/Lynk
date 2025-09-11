// app/api/session/route.js — Auth-only snapshots, delta trigger, improved fallback entities

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ---------- CORS / headers ----------
const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "X-Lynk-Route": "session",
};

// ---------- Identity / prompts ----------
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

// ---------- Token budgets ----------
const INPUT_TOKEN_BUDGET = 1200;     // per request input cap (approx)
const OUTPUT_TOKENS = 600;           // per request output cap

// Snapshot / background
const LIVE_NOTES_BUDGET = 800;       // for LLM snapshot input build window
const LIVE_NOTES_TOKENS = 150;       // snapshot generation output cap
const BACKGROUND_MODEL = "gpt-4o-mini";
const BACKGROUND_TEMP = 0.1;

// ---------- Utilities ----------
const estTokens = (s) => Math.ceil((s || "").length / 3.8);

const SESSIONS = new Map();

function getSessionKey(sessionId, userId = null) {
  return userId ? `auth:${userId}:${sessionId}` : `guest:${sessionId}`;
}

function getSession(sessionId, userId = null) {
  const key = getSessionKey(sessionId, userId);
  if (!SESSIONS.has(key)) {
    SESSIONS.set(key, {
      id: sessionId,
      turns: [],
      last: {},
      liveHistory: [],
      topicCounts: {},
      commands: [],
      userId,
      isGuest: !userId,
      createdAt: new Date().toISOString(),
      _lastSnapshotUserCount: 0,
    });
  }
  return SESSIONS.get(key);
}

function cleanupGuestSession(sessionId) {
  const guestKey = getSessionKey(sessionId, null);
  if (SESSIONS.has(guestKey)) SESSIONS.delete(guestKey);
}

async function getUserFromRequest(req) {
  try {
    const cookies = req.headers.get("cookie");
    if (!cookies) return null;
    const { origin } = new URL(req.url);
    const base = process.env.NEXTAUTH_URL || origin;
    const r = await fetch(`${base}/api/me`, { headers: { cookie: cookies }, cache: "no-store", credentials: "include" });
    if (r.ok) {
      const j = await r.json();
      return j.userId || null;
    }
    return null;
  } catch {
    return null;
  }
}

const asText = (x) => (typeof x === "string" ? x : String(x ?? ""));

function shouldInjectIdentity(message) {
  const triggers = [
    /(^|\b)(who are you|what are you|what model|what ai|what is lynk|which model|are you openai|are you claude)(\b)/i,
  ];
  return triggers.some((re) => re.test(message || ""));
}

// Keep most-recent turns within budget
function buildBudgetedTurns(turns, maxTokens) {
  const out = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    const cost = estTokens(t.content) + 6;
    if (used + cost > Math.max(100, Math.floor(maxTokens * 0.95))) break;
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

function extractJson(s) {
  const str = (s || "").trim();
  const start = str.indexOf("{");
  const end = str.lastIndexOf("}");
  if (start >= 0 && end > start) return str.slice(start, end + 1);
  return "{}";
}

// Optional utility if you want to guard external calls with timeouts
function runWithTimeout(promise, ms = 3500, label = "task") {
  let id;
  const t = new Promise((_, rej) => (id = setTimeout(() => rej(new Error(`Timeout: ${label}`)), ms)));
  return Promise.race([promise.finally(() => clearTimeout(id)), t]);
}

// Topic tracking -> lightweight suggestions
function trackMessageTopics(session, message) {
  if (!message || typeof message !== "string") return;

  const patterns = {
    ai: /\b(ai|artificial intelligence|machine learning|ml|llm|model|claude|openai|gpt|neural)\b/i,
    programming: /\b(code|coding|programming|javascript|python|react|api|function|debug)\b/i,
    business: /\b(business|strategy|revenue|cost|market|sales|customer|profit|growth)\b/i,
    data: /\b(data|database|sql|analytics|metrics|statistics|visualization)\b/i,
    design: /\b(design|ui|ux|interface|layout|visual|aesthetic)\b/i,
    project: /\b(project|deadline|planning|management|timeline|milestone|scope)\b/i,
  };

  const msg = message.trim();
  const hits = new Set();
  for (const [topic, re] of Object.entries(patterns)) if (re.test(msg)) hits.add(topic);

  for (const topic of hits) {
    const count = (session.topicCounts[topic] || 0) + 1;
    session.topicCounts[topic] = count;
    if (count % 4 === 0) {
      (session.commands ||= []).push({
        slug: topic,
        command: `${topic} best practices`,
        created_at: new Date().toISOString(),
        confidence: "med",
      });
    }
  }
}

// ----------- LLM-enhanced snapshot builder -----------
async function buildEnhancedLiveNotes(turns, fromTurn, toTurn) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { gist: "", key_points: [], entities: [], actions: [], insights: [] };

  // Keep a tight context for notes
  const relevantTurns = buildBudgetedTurns(turns, LIVE_NOTES_BUDGET);
  const chatExcerpt = relevantTurns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join("\n");

  const prompt = `Analyze this conversation segment (user turns ${fromTurn}-${toTurn}) and produce concise live notes.

Return STRICT JSON with:
{
  "gist": "2-3 sentence summary",
  "key_points": ["point 1","point 2","point 3"],
  "entities": ["entity 1","entity 2"],
  "actions": ["action item 1","decision made"],
  "insights": ["insight 1","insight 2"]
}

Keep arrays to 3-4 items max.`;

  const client = new OpenAI({ apiKey: key });
  const r = await runWithTimeout(
    client.chat.completions.create({
      model: BACKGROUND_MODEL,
      max_tokens: LIVE_NOTES_TOKENS,
      temperature: BACKGROUND_TEMP,
      messages: [
        { role: "system", content: "You produce terse, information-dense JSON only." },
        { role: "user", content: `${prompt}\n\nConversation:\n${chatExcerpt}` },
      ],
    }),
    5000,
    "live-notes"
  );

  const raw = r?.choices?.[0]?.message?.content?.toString?.() || "{}";
  const obj = JSON.parse(extractJson(raw));

  return {
    gist: typeof obj?.gist === "string" ? obj.gist : "",
    key_points: Array.isArray(obj?.key_points) ? obj.key_points.slice(0, 4) : [],
    entities: Array.isArray(obj?.entities) ? obj.entities.slice(0, 6) : [],
    actions: Array.isArray(obj?.actions) ? obj.actions.slice(0, 4) : [],
    insights: Array.isArray(obj?.insights) ? obj.insights.slice(0, 4) : [],
  };
}

// ----------- ROUTES -----------
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: H });
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const userId = await getUserFromRequest(req);

  if (!sessionId) {
    return Response.json(
      { ok: true, sessions: SESSIONS.size, userId: userId || "guest" },
      { headers: H }
    );
  }

  // If the caller is authenticated, ensure any guest thread with this id is gone.
  if (userId) cleanupGuestSession(sessionId);

  const s = getSession(sessionId, userId);

  return Response.json(
    {
      ok: true,
      inspector: {
        live_history: s.liveHistory || [],
        commands: s.commands || [],
        topicCounts: s.topicCounts || {},
      },
      session: {
        id: s.id,
        turns: s.turns.length,
        userTurns: userTurnCount(s.turns),
        isGuest: s.isGuest,
        userId: s.userId,
        createdAt: s.createdAt,
      },
    },
    { headers: H }
  );
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = asText(body?.message ?? "");
    if (!message) return new Response("Missing message", { status: 400, headers: H });

    let sessionId = asText(body?.sessionId || "");
    if (!sessionId) sessionId = crypto.randomUUID?.() || "sess_" + Math.random().toString(36).slice(2);

    const userId = await getUserFromRequest(req);

    // Product rule: if authenticated, guest thread with this id must vanish.
    if (userId) cleanupGuestSession(sessionId);

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
    s.turns.push({ role: "user", content: message, provider, model: modelName, timestamp: new Date().toISOString() });

    // --------- Route to selected provider ---------
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
      const bodyJson = { model: modelName, max_tokens: OUTPUT_TOKENS, temperature: 0.4, messages: buildAnthropicMessages(s.turns), ...(needsIdentity ? { system: systemIdentity } : {}) };
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": key },
        body: JSON.stringify(bodyJson),
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

    s.turns.push({ role: "assistant", content: assistantText, provider, model: modelName, timestamp: new Date().toISOString() });
    s.last = { provider, model: modelName };

    // suggestions
    trackMessageTopics(s, message);

    // --------- Snapshot logic (AUTH ONLY) ---------
    const uCount = userTurnCount(s.turns);

    // Trigger: first at >=5, then every +5 user messages since last snapshot
    const readyForSnapshot = !s.isGuest && uCount >= 5 && (uCount - (s._lastSnapshotUserCount || 0) >= 5);

    if (readyForSnapshot) {
      const fromTurn = (s._lastSnapshotUserCount || 0) + 1;
      const toTurn = uCount;

      let entry = null;

      // Try LLM-powered notes first (if OpenAI key available)
      try {
        if (process.env.OPENAI_API_KEY) {
          const contextTurns = s.turns.slice(-20);
          const note = await buildEnhancedLiveNotes(contextTurns, fromTurn, toTurn);
          entry = {
            id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            created_at: new Date().toISOString(),
            from_turn: fromTurn,
            to_turn: toTurn,
            gist: note.gist || "",
            key_points: Array.isArray(note.key_points) ? note.key_points.slice(0, 4) : [],
            entities: Array.isArray(note.entities) ? note.entities.slice(0, 6) : [],
            actions: Array.isArray(note.actions) ? note.actions.slice(0, 4) : [],
            insights: Array.isArray(note.insights) ? note.insights.slice(0, 4) : [],
          };
        }
      } catch {
        // fall through to lightweight
      }

      // Token-free fallback (improved entity extraction)
      if (!entry) {
        const recentTurns = s.turns.slice(-12);
        const userMsgs = recentTurns.filter((t) => t.role === "user").map((t) => t.content || "");
        const asstMsgs = recentTurns.filter((t) => t.role === "assistant").map((t) => t.content || "");

        const rawText = [...userMsgs, ...asstMsgs].join(" ").replace(/\s+/g, " ").trim();
        const lc = rawText.toLowerCase();

        const topics = [];
        if (/\b(food|cooking|recipe|ingredient|nutrition)\b/.test(lc)) topics.push("Food & Cooking");
        if (/\b(code|programming|javascript|python|react|api)\b/.test(lc)) topics.push("Programming");
        if (/\b(business|strategy|market|revenue|sales)\b/.test(lc)) topics.push("Business");
        if (/\b(data|analysis|chart|graph|metrics)\b/.test(lc)) topics.push("Data Analysis");
        if (/\b(design|ui|ux|interface|layout)\b/.test(lc)) topics.push("Design");

        // FIX: extract candidates from non-lowercased text and de-noise
        const stop = new Set([
          "I","We","You","They","It","The","A","An","And","Or","Of","To","In","On","For","With","By","At","As","Be",
          "This","That","These","Those","My","Your","Our","Their","He","She","His","Her","Its"
        ]);
        const capWords = (rawText.match(/\b[A-Z][A-Za-z0-9-]{2,}\b/g) || [])
          .filter((w) => !stop.has(w))
          .slice(0, 8);

        const actions = [];
        if (/\b(create|build|make|develop|implement|ship)\b/.test(lc)) actions.push("Create / build");
        if (/\b(analyze|review|examine|study|audit)\b/.test(lc)) actions.push("Analyze information");
        if (/\b(explain|describe|clarify|summarize)\b/.test(lc)) actions.push("Provide explanation");
        if (/\b(help|assist|support|guide)\b/.test(lc)) actions.push("Offer assistance");

        const topicLine = topics.length ? topics.join(", ") : "various topics";

        entry = {
          id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          created_at: new Date().toISOString(),
          from_turn: fromTurn,
          to_turn: toTurn,
          gist: `Discussion touched on ${topicLine}.`,
          key_points: topics.length ? topics.map((t) => `Discussion about ${t}`).slice(0, 4) : ["Active conversation"],
          entities: capWords.length ? capWords.slice(0, 6) : ["User", "Assistant"],
          actions: actions.slice(0, 4),
          insights: [
            topics.length ? `Primary topic: ${topics[0]}` : "General discussion",
            "Periodic context note",
          ].slice(0, 4),
        };
      }

      if (!s.liveHistory) s.liveHistory = [];
      s.liveHistory.push(entry);
      s._lastSnapshotUserCount = uCount;
    }

    const responseData = {
      text: assistantText,
      inspector: {
        live_history: s.liveHistory || [],
        commands: s.commands || [],
        topicCounts: s.topicCounts || {},
      },
      sessionMeta: {
        isGuest: s.isGuest,
        userId: s.userId,
        provider,
        model: modelName,
        userTurns: uCount,
        totalTurns: s.turns.length,
        sessionId: sessionId,
      },
    };

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { ...H, "Content-Type": "application/json; charset=utf-8", "X-Session-Id": sessionId },
    });
  } catch (e) {
    return new Response(`Session error: ${e?.message || String(e)}`, { status: 500, headers: H });
  }
}
