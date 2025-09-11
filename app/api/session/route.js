// app/api/session/route.js — Fixed Live Notes with proper data flow + secure session management

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

// CORS
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

// Optimized token budgets
const INPUT_TOKEN_BUDGET = 1200;
const OUTPUT_TOKENS = 600;
const LIVE_NOTES_BUDGET = 800;
const LIVE_NOTES_TOKENS = 150;
const BACKGROUND_MODEL = "gpt-4o-mini";
const BACKGROUND_TEMP = 0.1;

const estTokens = (s) => Math.ceil((s || "").length / 3.8);

// In-memory session storage with proper key separation
const SESSIONS = new Map();

function getSessionKey(sessionId, userId = null) {
  // Ensure proper isolation between guest and authenticated sessions
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
    });
  }
  return SESSIONS.get(key);
}

// Clean up guest sessions when user authenticates (prevent session bleeding)
function cleanupGuestSession(sessionId) {
  const guestKey = getSessionKey(sessionId, null);
  if (SESSIONS.has(guestKey)) {
    SESSIONS.delete(guestKey);
  }
}

// Auth helper
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
  } catch {
    return null;
  }
}

// Utility functions
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

function runWithTimeout(promise, ms = 3000, label = "task") {
  let id;
  const t = new Promise((_, rej) => (id = setTimeout(() => rej(new Error(`Timeout: ${label}`)), ms)));
  return Promise.race([promise.finally(() => clearTimeout(id)), t]);
}

// Enhanced topic tracking for command generation
function trackMessageTopics(session, message) {
  if (!message || typeof message !== "string") return;

  const patterns = {
    ai: /\b(ai|artificial intelligence|machine learning|ml|llm|model|claude|openai|gpt|neural|algorithm)\b/i,
    programming: /\b(code|coding|programming|javascript|python|react|api|development|software|function|variable|debug)\b/i,
    business: /\b(business|strategy|revenue|cost|optimization|market|sales|customer|profit|growth|analysis)\b/i,
    data: /\b(data|database|sql|analytics|metrics|statistics|analysis|chart|graph|visualization)\b/i,
    design: /\b(design|ui|ux|interface|user experience|frontend|styling|layout|visual|aesthetic)\b/i,
    project: /\b(project|task|deadline|planning|management|timeline|milestone|deliverable|scope)\b/i,
    content: /\b(content|writing|documentation|blog|article|copy|text|narrative|story)\b/i,
    research: /\b(research|study|analysis|investigation|findings|methodology|hypothesis|evidence)\b/i,
  };

  const msg = message.trim();
  const numbers =
    /^[\s\d]+$/.test(msg) ||
    /\b(count|counting|sequence|sequential|next number|increment|calculate|math)\b/i.test(msg) ||
    /(?:^|\s)\d+(?:[\s,]+\d+){2,}\s*$/.test(msg);

  const hits = new Set();
  for (const [topic, re] of Object.entries(patterns)) if (re.test(message)) hits.add(topic);
  if (numbers) hits.add("numbers");

  for (const topic of hits) {
    const count = (session.topicCounts[topic] || 0) + 1;
    session.topicCounts[topic] = count;

    if (count % 4 === 0) {
      const add = (label) =>
        (session.commands ||= []).push({
          slug: topic,
          command: label,
          created_at: new Date().toISOString(),
          confidence: "med",
        });

      if (topic === "numbers") {
        add("numbers?");
        add("continue counting");
        add("analyze the sequence");
      } else if (topic === "programming") {
        add("debug this code");
        add("optimize performance");
        add("add error handling");
      } else if (topic === "business") {
        add("analyze market trends");
        add("calculate ROI");
        add("competitive analysis");
      } else {
        add(`tell me more about ${topic}`);
        add(`${topic} best practices`);
      }
    }
  }
}

// Enhanced Live Notes generation
async function buildEnhancedLiveNotes(turns, fromTurn, toTurn) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { gist: "", key_points: [], entities: [], actions: [], insights: [] };

  const relevantTurns = buildBudgetedTurns(turns, LIVE_NOTES_BUDGET);
  const chatExcerpt = relevantTurns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join("\n");
  
  const prompt = `Analyze this conversation segment (turns ${fromTurn}-${toTurn}) and create comprehensive live notes.

Return JSON with this exact structure:
{
  "gist": "2-3 sentence summary of main discussion",
  "key_points": ["point 1", "point 2", "point 3"],
  "entities": ["person/company/concept 1", "entity 2"],
  "actions": ["action item 1", "decision made"],
  "insights": ["key insight or pattern", "important observation"]
}

Keep each array to 3-4 items max. Be concise but informative.

Conversation:
${chatExcerpt}`;

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
    
    return {
      gist: typeof obj?.gist === "string" ? obj.gist : "",
      key_points: Array.isArray(obj?.key_points) ? obj.key_points.slice(0, 4) : [],
      entities: Array.isArray(obj?.entities) ? obj.entities.slice(0, 4) : [],
      actions: Array.isArray(obj?.actions) ? obj.actions.slice(0, 4) : [],
      insights: Array.isArray(obj?.insights) ? obj.insights.slice(0, 4) : [],
    };
  } catch (e) {
    console.error("Live Notes generation failed:", e);
    return { gist: "", key_points: [], entities: [], actions: [], insights: [] };
  }
}

// OPTIONS handler
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: H });
}

// GET handler (polling) - Fixed to return proper data
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const userId = await getUserFromRequest(req);

  if (!sessionId) {
    return Response.json({ 
      ok: true, 
      sessions: SESSIONS.size, 
      userId: userId || "guest",
      debug: "No sessionId provided"
    }, { headers: H });
  }

  const s = getSession(sessionId, userId);

  if (!s) {
    return Response.json({ 
      ok: false, 
      error: "session not found",
      sessionId,
      userId: userId || "guest"
    }, { headers: H });
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
      debug: {
        sessionKey: getSessionKey(sessionId, userId),
        liveHistoryCount: (s.liveHistory || []).length,
        commandsCount: (s.commands || []).length,
      }
    },
    { headers: H },
  );
}

// POST handler (chat turn) - Fixed session isolation and counting
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = asText(body?.message ?? "");
    if (!message) return new Response("Missing message", { status: 400, headers: H });

    let sessionId = asText(body?.sessionId || "");
    if (!sessionId) sessionId = crypto.randomUUID?.() || "sess_" + Math.random().toString(36).slice(2);

    const userId = await getUserFromRequest(req);

    // If user just authenticated, clean up any guest session to prevent bleeding
    if (userId) {
      cleanupGuestSession(sessionId);
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
          : "claude-3-haiku-20240307"),
    );

    const needsIdentity = shouldInjectIdentity(message);
    const systemIdentity = needsIdentity ? buildIdentitySystemPrompt({ appName: APP_NAME, provider, modelName }) : null;

    const s = getSession(sessionId, userId);
    s.turns.push({ role: "user", content: message, provider, model: modelName, timestamp: new Date().toISOString() });

    // Provider routing and API calls
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

    // Track topics for command generation
    trackMessageTopics(s, message);

    // Enhanced Live Notes generation every 5 turns for verified users only
    const uCount = userTurnCount(s.turns);
    console.log(`Session ${sessionId}: User turn ${uCount}, isGuest: ${s.isGuest}`);
    
    if (!s.isGuest && uCount >= 5 && uCount % 5 === 0) {
      console.log(`Generating Live Notes for turn ${uCount}`);
      try {
        const fromTurn = uCount - 4;
        const toTurn = uCount;
        const liveNotes = await runWithTimeout(
          buildEnhancedLiveNotes(s.turns, fromTurn, toTurn), 
          3000, 
          "enhanced-live-notes"
        );
        
        const entry = {
          created_at: new Date().toISOString(),
          from_turn: fromTurn,
          to_turn: toTurn,
          ...liveNotes,
        };
        
        (s.liveHistory ||= []).push(entry);
        console.log(`Live Notes created: ${JSON.stringify(entry, null, 2)}`);
      } catch (e) {
        console.error("Enhanced Live Notes failed:", e);
      }
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
      debug: {
        sessionKey: getSessionKey(sessionId, userId),
        liveHistoryCount: (s.liveHistory || []).length,
        commandsCount: (s.commands || []).length,
        lastUserTurn: uCount,
        shouldGenerateLiveNotes: !s.isGuest && uCount >= 5 && uCount % 5 === 0,
      }
    };

    console.log(`Response data for session ${sessionId}:`, JSON.stringify(responseData, null, 2));

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { ...H, "Content-Type": "application/json; charset=utf-8", "X-Session-Id": sessionId },
    });
  } catch (e) {
    console.error("Session error:", e);
    return new Response(`Session error: ${e?.message || String(e)}`, { status: 500, headers: H });
  }
}