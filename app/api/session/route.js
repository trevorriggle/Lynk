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

// Optimized token budgets for snapshots
const LIVE_NOTES_BUDGET = 600; // Reduced from 800
const LIVE_NOTES_TOKENS = 100; // Reduced from 150
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

function runWithTimeout(p, ms = 3000, label = "task") { // Reduced timeout
  let id;
  const guard = new Promise((_, rej) => {
    id = setTimeout(() => rej(new Error(`Timeout: ${label}`)), ms);
  });
  return Promise.race([p.finally(() => clearTimeout(id)), guard]);
}

// ---------- Commands/Suggestions ----------
function trackMessageTopics(session, message) {
  if (!message || typeof message !== "string") return;
  const rules = {
    programming: /\b(js|javascript|typescript|python|react|api|debug|code|function|programming|development)\b/i,
    design: /\b(design|ui|ux|layout|typography|grid|spacing|visual|interface|component)\b/i,
    data: /\b(data|sql|metrics|chart|graph|analytics|database|visualization)\b/i,
    business: /\b(strategy|pricing|market|sales|roi|cost|business|revenue|plan)\b/i,
    ai: /\b(ai|llm|model|gpt|claude|gemini|embedding|token|machine learning|neural)\b/i,
    project: /\b(project|management|agile|scrum|sprint|delivery|roadmap|timeline)\b/i,
  };
  
  const hits = Object.entries(rules)
    .filter(([, re]) => re.test(message))
    .map(([k]) => k);
    
  for (const k of hits) {
    const c = (session.topicCounts[k] || 0) + 1;
    session.topicCounts[k] = c;
    
    // Generate command suggestion after 4 mentions
    if (c === 4) {
      (session.commands ||= []).push({
        slug: k,
        command: `${k} best practices`,
        created_at: new Date().toISOString(),
        confidence: "high",
      });
    }
  }
}

// ---------- Optimized Live Notes Generation ----------
async function generateLiveNotes(turns, fromTurn, toTurn) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    // Lightweight fallback without LLM
    return createFallbackNotes(turns);
  }

  try {
    // Only use last 5 turns for efficiency
    const recentTurns = turns.slice(-10).filter(t => t.role === "user" || t.role === "assistant");
    const chatText = recentTurns
      .map(t => `${t.role === "user" ? "U" : "A"}: ${t.content}`)
      .join("\n")
      .slice(0, 1500); // Hard limit for tokens

    const client = new OpenAI({ apiKey: key });
    
    // Minimal, efficient prompt
    const response = await runWithTimeout(
      client.chat.completions.create({
        model: BACKGROUND_MODEL,
        max_tokens: LIVE_NOTES_TOKENS,
        temperature: BACKGROUND_TEMP,
        messages: [
          {
            role: "system",
            content: "Return only JSON. Be concise."
          },
          {
            role: "user",
            content: `Summarize this chat in JSON format:
{"key_topics":["topic1","topic2"],"discussion":"Brief summary"}

Chat:
${chatText}`
          }
        ],
      }),
      3000,
      "notes"
    );

    const raw = response?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(extractJson(raw));
    
    return {
      key_topics: Array.isArray(parsed.key_topics) ? parsed.key_topics.slice(0, 3) : [],
      discussion: typeof parsed.discussion === "string" ? parsed.discussion.slice(0, 200) : "",
    };
  } catch (error) {
    return createFallbackNotes(turns);
  }
}

function createFallbackNotes(turns) {
  const recent = turns.slice(-10);
  const userContent = recent
    .filter(t => t.role === "user")
    .map(t => t.content)
    .join(" ")
    .toLowerCase();
  
  const topics = [];
  if (/\b(design|ui|ux|visual)\b/.test(userContent)) topics.push("Design");
  if (/\b(code|programming|development)\b/.test(userContent)) topics.push("Programming");
  if (/\b(data|analytics|metrics)\b/.test(userContent)) topics.push("Data");
  if (/\b(business|strategy|market)\b/.test(userContent)) topics.push("Business");
  if (/\b(ai|model|gpt|claude)\b/.test(userContent)) topics.push("AI");
  
  if (topics.length === 0) topics.push("General");
  
  return {
    key_topics: topics.slice(0, 3),
    discussion: `Discussion covering ${topics[0]} with interactive conversation.`,
  };
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

    trackMessageTopics(s, message);

    // ---- Snapshots (AUTH ONLY, EVERY 5 USER TURNS) ----
    const uCount = userTurnCount(s.turns);
    const shouldCreateSnapshot = 
      !s.isGuest && 
      uCount % 5 === 0 && 
      uCount > s._lastSnapshotUserCount;

    if (shouldCreateSnapshot) {
      const fromTurn = s._lastSnapshotUserCount + 1;
      const toTurn = uCount;
      
      try {
        const liveNotes = await generateLiveNotes(s.turns, fromTurn, toTurn);
        
        const entry = {
          id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          created_at: new Date().toISOString(),
          from_turn: fromTurn,
          to_turn: toTurn,
          key_topics: liveNotes.key_topics || ["General"],
          discussion: liveNotes.discussion || "Ongoing conversation summary",
        };

        if (!s.liveHistory) s.liveHistory = [];
        s.liveHistory.push(entry);
        s._lastSnapshotUserCount = uCount;
      } catch (error) {
        // Silently fail to avoid disrupting user experience
      }
    }

    return new Response(
      JSON.stringify({
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
      }),
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
    return new Response(`Session error: ${e?.message || String(e)}`, {
      status: 500,
      headers: H,
    });
  }
}