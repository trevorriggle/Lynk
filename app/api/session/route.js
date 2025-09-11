// app/api/session/route.js — auth-only snapshots, delta trigger, high-signal notes

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ---------- Headers ----------
const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "X-Lynk-Route": "session",
};

// ---------- Identity ----------
const APP_NAME = "Lynk";
function buildIdentitySystemPrompt({ appName, provider, modelName }) {
  return [
    `${appName} system identity`,
    `- You are "${appName}" — an AI interface that routes conversations across multiple LLMs.`,
    `- For THIS conversation: provider="${provider}", model="${modelName}".`,
    `- If asked, reply exactly: "I'm ${appName}. This chat is currently powered by ${provider} ${modelName} via ${appName}."`,
    `- Refer to yourself as "${appName}".`,
  ].join("\n");
}

// ---------- Budgets ----------
const INPUT_TOKEN_BUDGET = 1200;
const OUTPUT_TOKENS = 600;

const LIVE_NOTES_BUDGET = 800;
const LIVE_NOTES_TOKENS = 150;
const BACKGROUND_MODEL = "gpt-4o-mini";
const BACKGROUND_TEMP = 0.1;

// ---------- Session store ----------
const SESSIONS = new Map();
const estTokens = (s) => Math.ceil((s || "").length / 3.8);

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
    const r = await fetch(`${base}/api/me`, {
      headers: { cookie: cookies },
      cache: "no-store",
      credentials: "include",
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.userId || null;
  } catch {
    return null;
  }
}

const asText = (x) => (typeof x === "string" ? x : String(x ?? ""));

// ---------- Prompt guards ----------
function shouldInjectIdentity(message) {
  const triggers = [
    /(^|\b)(who are you|what (are you|model)|what ai|what is lynk|which model|are you (openai|claude|gemini))(\b)/i,
  ];
  return triggers.some((re) => re.test(message || ""));
}

// ---------- Message shaping ----------
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

const userTurnCount = (turns) =>
  turns.reduce((n, t) => (t.role === "user" ? n + 1 : n), 0);

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

// ---------- Provider adapter ----------
async function callOpenAICompatible({
  baseURL,
  key,
  model,
  messages,
  max_tokens = OUTPUT_TOKENS,
  temperature = 0.4,
}) {
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${key}`,
    },
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

function runWithTimeout(p, ms = 4500, label = "task") {
  let id;
  const guard = new Promise((_, rej) => {
    id = setTimeout(() => rej(new Error(`Timeout: ${label}`)), ms);
  });
  return Promise.race([p.finally(() => clearTimeout(id)), guard]);
}

// ---------- Suggestions ----------
function trackMessageTopics(session, message) {
  if (!message || typeof message !== "string") return;
  const rules = {
    programming: /\b(js|javascript|typescript|python|react|api|debug|code|function)\b/i,
    design: /\b(design|ui|ux|layout|typography|grid|spacing)\b/i,
    data: /\b(data|sql|metrics|chart|graph|analytics)\b/i,
    business: /\b(strategy|pricing|market|sales|roi|cost)\b/i,
    ai: /\b(ai|llm|model|gpt|claude|gemini|embedding|token)\b/i,
  };
  const hits = Object.entries(rules)
    .filter(([, re]) => re.test(message))
    .map(([k]) => k);
  for (const k of hits) {
    const c = (session.topicCounts[k] || 0) + 1;
    session.topicCounts[k] = c;
    if (c % 4 === 0) {
      (session.commands ||= []).push({
        slug: k,
        command: `${k} best practices`,
        created_at: new Date().toISOString(),
        confidence: "med",
      });
    }
  }
}

// ---------- Live Notes (LLM) ----------
async function buildEnhancedLiveNotes(turns, fromTurn, toTurn) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.log("🔍 Backend: No OPENAI_API_KEY found, skipping enhanced notes");
    return { gist: "", key_points: [], entities: [], actions: [], insights: [] };
  }

  const relevantTurns = buildBudgetedTurns(turns, LIVE_NOTES_BUDGET);
  const chat = relevantTurns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join("\n");

  console.log("🔍 Backend: Building enhanced notes for turns", fromTurn, "to", toTurn);
  console.log("🔍 Backend: Chat context length:", chat.length);

  const system = "Return *only* strict JSON. Be concise and specific.";
  const user = `Analyze user turns ${fromTurn}-${toTurn} and produce notes.

SCHEMA:
{
  "gist": "2-3 sentences; specific, no filler",
  "key_points": ["<=4 crisp bullets with facts/decisions"],
  "entities": ["<=6 proper nouns or noun phrases relevant to the chat (company, person, product, file, feature)"],
  "actions": ["<=4 action items/decisions, imperative phrasing"],
  "insights": ["<=4 non-obvious observations/patterns or risks"]
}

Conversation:
${chat}`;

  try {
    const client = new OpenAI({ apiKey: key });
    console.log("🔍 Backend: Calling OpenAI for live notes...");
    
    const r = await runWithTimeout(
      client.chat.completions.create({
        model: BACKGROUND_MODEL,
        max_tokens: LIVE_NOTES_TOKENS,
        temperature: BACKGROUND_TEMP,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      6000,
      "live-notes"
    );

    const raw = r?.choices?.[0]?.message?.content?.toString?.() || "{}";
    console.log("🔍 Backend: Raw LLM response:", raw);
    
    const obj = JSON.parse(extractJson(raw));
    console.log("🔍 Backend: Parsed LLM object:", JSON.stringify(obj, null, 2));

    const result = {
      gist: typeof obj?.gist === "string" ? obj.gist : "",
      key_points: Array.isArray(obj?.key_points) ? obj.key_points.slice(0, 4) : [],
      entities: Array.isArray(obj?.entities) ? obj.entities.slice(0, 6) : [],
      actions: Array.isArray(obj?.actions) ? obj.actions.slice(0, 4) : [],
      insights: Array.isArray(obj?.insights) ? obj.insights.slice(0, 4) : [],
    };

    console.log("🔍 Backend: Final enhanced notes result:", JSON.stringify(result, null, 2));
    return result;

  } catch (error) {
    console.log("🔍 Backend: Error in buildEnhancedLiveNotes:", error.message);
    return { gist: "", key_points: [], entities: [], actions: [], insights: [] };
  }
}

// ---------- Token-free fallback (fixed entities) ----------
function fallbackNotesFrom(turns, fromTurn, toTurn) {
  console.log("🔍 Backend: Using fallback notes generator");
  
  const recent = turns.slice(-16);
  const userMsgs = recent.filter((t) => t.role === "user").map((t) => t.content || "");
  const asstMsgs = recent.filter((t) => t.role === "assistant").map((t) => t.content || "");
  const joined = [...userMsgs, ...asstMsgs].join(" ").replace(/\s+/g, " ").trim();

  const lc = joined.toLowerCase();

  // topic buckets
  const topics = [];
  if (/\b(ui|ux|design|layout|typography|component|grid)\b/.test(lc)) topics.push("Design");
  if (/\b(code|javascript|python|react|api|function)\b/.test(lc)) topics.push("Programming");
  if (/\b(data|metric|chart|dashboard|analytics|sql)\b/.test(lc)) topics.push("Data");
  if (/\b(market|pricing|sales|cost|roi|plan|timeline)\b/.test(lc)) topics.push("Business");
  if (/\b(model|ai|gpt|claude|gemini|token|embedding)\b/.test(lc)) topics.push("AI");

  // entities: capture multi-word proper-noun-ish phrases
  const stop = new Set([
    "I","We","You","They","It","The","A","An","And","Or","Of","To","In","On","For","With","By","At","As",
    "This","That","These","Those","My","Your","Our","Their","He","She","His","Her","Its"
  ]);
  const capSeqs = [];
  const tokens = (joined.match(/\b[A-Za-z0-9\-]+\b/g) || []);
  let buf = [];
  const flush = () => {
    if (buf.length === 0) return;
    const phrase = buf.join(" ");
    if (phrase.length >= 3) capSeqs.push(phrase);
    buf = [];
  };
  for (const tok of tokens) {
    const isCap = /^[A-Z][A-Za-z0-9\-]+$/.test(tok) && !stop.has(tok);
    if (isCap) buf.push(tok);
    else flush();
  }
  flush();
  // De-dup & rank by length, then slice
  const entities = Array.from(new Set(capSeqs))
    .sort((a, b) => b.length - a.length)
    .slice(0, 6);

  // actions
  const actions = [];
  if (/\b(create|build|implement|ship|deploy|draft|design)\b/.test(lc)) actions.push("Create/implement next step");
  if (/\b(review|audit|analyze|evaluate|measure|benchmark)\b/.test(lc)) actions.push("Review & analyze");
  if (/\b(align|decide|approve|sign off|confirm)\b/.test(lc)) actions.push("Decision/approval needed");
  if (/\b(schedule|meet|sync|share|send)\b/.test(lc)) actions.push("Schedule/share follow-up");

  const topicLine = topics.length ? topics.join(", ") : "general discussion";

  const result = {
    gist: `Concise recap across ${topicLine}.`,
    key_points: topics.length
      ? topics.slice(0, 4).map((t) => `Discussion on ${t}`)
      : ["Ongoing exchange"],
    entities: entities.length ? entities : ["Context not specific"],
    actions: actions.slice(0, 4),
    insights: [
      topics[0] ? `Primary focus: ${topics[0]}` : "No dominant topic",
      "Periodic context snapshot",
    ].slice(0, 4),
  };

  console.log("🔍 Backend: Fallback notes result:", JSON.stringify(result, null, 2));
  return result;
}

// ---------- Routes ----------
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

  // Product rule: if authed, ensure any guest thread with same id is gone
  if (userId) cleanupGuestSession(sessionId);

  const s = getSession(sessionId, userId);

  console.log("🔍 Backend: GET request for session", sessionId, "live_history length:", s.liveHistory?.length || 0);
  if (s.liveHistory?.length > 0) {
    console.log("🔍 Backend: First live history item:", JSON.stringify(s.liveHistory[0], null, 2));
  }

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
    if (userId) cleanupGuestSession(sessionId); // nuke guest if login happened

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
    const systemIdentity = needsIdentity
      ? buildIdentitySystemPrompt({ appName: APP_NAME, provider, modelName })
      : null;

    const s = getSession(sessionId, userId);
    s.turns.push({
      role: "user",
      content: message,
      provider,
      model: modelName,
      timestamp: new Date().toISOString(),
    });

    // ---- Call chosen provider ----
    let assistantText = "";
    if (provider === "xai") {
      const key = process.env.XAI_API_KEY;
      if (!key) return new Response("XAI_API_KEY missing", { status: 500, headers: H });
      const messages = needsIdentity
        ? [{ role: "system", content: systemIdentity }, ...buildOpenAIMessages(s.turns)]
        : buildOpenAIMessages(s.turns);
      assistantText = await callOpenAICompatible({
        baseURL: "https://api.x.ai/v1",
        key,
        model: modelName,
        messages,
        max_tokens: OUTPUT_TOKENS,
        temperature: 0.4,
      });
    } else if (provider === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return new Response("OPENAI_API_KEY missing", { status: 500, headers: H });
      const client = new OpenAI({ apiKey: key });
      const messages = needsIdentity
        ? [{ role: "system", content: systemIdentity }, ...buildOpenAIMessages(s.turns)]
        : buildOpenAIMessages(s.turns);
      const r = await client.chat.completions.create({
        model: modelName,
        max_tokens: OUTPUT_TOKENS,
        temperature: 0.4,
        messages,
      });
      assistantText = r?.choices?.[0]?.message?.content?.toString?.() || "Okay.";
    } else if (provider === "anthropic") {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return new Response("ANTHROPIC_API_KEY missing", { status: 500, headers: H });
      const payload = {
        model: modelName,
        max_tokens: OUTPUT_TOKENS,
        temperature: 0.4,
        messages: buildAnthropicMessages(s.turns),
        ...(needsIdentity ? { system: systemIdentity } : {}),
      };
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": key,
        },
        body: JSON.stringify(payload),
      });
      const txt = await r.text();
      if (!r.ok) return new Response(`Claude ${r.status}: ${txt}`, { status: 502, headers: H });
      try {
        const data = JSON.parse(txt);
        assistantText =
          (data?.content || [])
            .filter((b) => b?.type === "text")
            .map((b) => b.text)
            .join("") || "Okay.";
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
      const result = await model.generateContent({
        contents: history,
        generationConfig: { maxOutputTokens: OUTPUT_TOKENS, temperature: 0.4 },
      });
      assistantText = result?.response?.text?.() || "Okay.";
    }

    s.turns.push({
      role: "assistant",
      content: assistantText,
      provider,
      model: modelName,
      timestamp: new Date().toISOString(),
    });
    s.last = { provider, model: modelName };

    // Suggestions
    trackMessageTopics(s, message);

    // ---- Snapshots (AUTH ONLY) ----
    const uCount = userTurnCount(s.turns);
    const ready =
      !s.isGuest &&
      uCount >= 5 &&
      uCount - (s._lastSnapshotUserCount || 0) >= 5;

    console.log("🔍 Backend: Snapshot check - isGuest:", s.isGuest, "uCount:", uCount, "lastSnapshot:", s._lastSnapshotUserCount, "ready:", ready);

    if (ready) {
      const fromTurn = (s._lastSnapshotUserCount || 0) + 1;
      const toTurn = uCount;

      console.log("🔍 Backend: Creating snapshot for turns", fromTurn, "to", toTurn);

      let note = null;
      try {
        if (process.env.OPENAI_API_KEY) {
          note = await buildEnhancedLiveNotes(s.turns.slice(-24), fromTurn, toTurn);
        }
      } catch (error) {
        console.log("🔍 Backend: Enhanced notes failed:", error.message);
        note = null;
      }
      if (!note) note = fallbackNotesFrom(s.turns, fromTurn, toTurn);

      const entry = {
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

      console.log("🔍 Backend: Final snapshot entry:", JSON.stringify(entry, null, 2));

      if (!s.liveHistory) s.liveHistory = [];
      s.liveHistory.push(entry);
      s._lastSnapshotUserCount = uCount;

      console.log("🔍 Backend: Added snapshot, total live history items:", s.liveHistory.length);
    }

    // ---- Response ----
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
        sessionId,
      },
    };

    console.log("🔍 Backend: Response inspector data:", JSON.stringify(responseData.inspector, null, 2));

    return new Response(
      JSON.stringify(responseData),
      {
        status: 200,
        headers: {
          ...H,
          "Content-Type": "application/json; charset=utf-8",
          "X-Session-Id": sessionId,
        },
      }
    );
  } catch (e) {
    console.log("🔍 Backend: Session error:", e.message);
    return new Response(`Session error: ${e?.message || String(e)}`, {
      status: 500,
      headers: H,
    });
  }
}