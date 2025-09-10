// app/api/session/route.js - ULTRA COST OPTIMIZED - FIXED WITH DEBUG
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

// --- CORS / headers ---
const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "X-Lynk-Route": "session",
};

// --- Identity System ---
const APP_NAME = "Lynk";

function buildIdentitySystemPrompt({ appName, provider, modelName }) {
  return [
    `${appName} system identity`,
    `- You are "${appName}" - an AI interface that routes conversations through multiple large language models.`,
    `- For THIS conversation, your current underlying model is: provider="${provider}", model="${modelName}".`,
    `- If asked about your identity, reply: "I'm ${appName}. This chat is currently powered by ${provider} ${modelName} via ${appName}."`,
    `- You can switch between OpenAI, Anthropic, Google/Gemini, xAI, and other providers mid-conversation.`,
    `- Refer to yourself as "${appName}" (not ChatGPT, Claude, Gemini, etc.).`,
  ].join("\n");
}

// --- ULTRA AGGRESSIVE cost guards ---
const INPUT_TOKEN_BUDGET = 1000;     
const OUTPUT_TOKENS = 600;           
const estTokens = (s) => Math.ceil((s || "").length / 4);

// --- Background task caps (MINIMAL) ---
const LIVE_NOTES_BUDGET = 400;       
const LIVE_NOTES_TOKENS = 64;        
const SNAPSHOT_INPUT_BUDGET = 500;   
const SNAPSHOT_OUTPUT_TOKENS = 128;  

// --- ALWAYS use cheapest model for background (gpt-4o-mini only) ---
const BACKGROUND_MODEL = "gpt-4o-mini";
const BACKGROUND_TEMP = 0.1;

// --- Session store with user isolation ---
const SESSIONS = new Map();
const getSession = (id, userId = null) => {
  const sessionKey = userId ? `${userId}:${id}` : `guest:${id}`;
  if (!SESSIONS.has(sessionKey)) {
    SESSIONS.set(sessionKey, {
      turns: [],
      last: {},
      live: { gist: "", key_points: [], todos: [], entities: [] },
      topicCounts: {},
      commands: [],
      snapshots: [],
      userId,
      isGuest: !userId,
      _topicSeenAt: {},
      commandState: {},
    });
  }
  return SESSIONS.get(sessionKey);
};

// --- auth helper ---
async function getUserFromRequest(req) {
  try {
    const cookies = req.headers.get("cookie");
    if (!cookies) return null;
    const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || "http://localhost:3000";
    const meResponse = await fetch(`${baseUrl}/api/me`, {
      headers: { cookie: cookies },
      cache: "no-store",
    });
    if (meResponse.ok) {
      const data = await meResponse.json();
      return data.userId || null;
    }
    return null;
  } catch (e) {
    console.warn("getUserFromRequest failed:", e);
    return null;
  }
}

// --- helpers ---
const asText = (x) => (typeof x === "string" ? x : String(x ?? ""));

function shouldInjectIdentity(message) {
  const identityTriggers = [
    /who are you/i,
    /what are you/i,
    /what model/i,
    /what ai/i,
    /what is lynk/i,
  ];
  return identityTriggers.some(trigger => trigger.test(message));
}

const buildBudgetedTurns = (turns, maxTokens) => {
  const out = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    const cost = estTokens(t.content) + 4;
    if (used + cost > maxTokens) break;
    out.unshift(t);
    used += cost;
  }
  return out;
};

const userTurnCount = (turns) => turns.reduce((n, t) => n + (t.role === "user" ? 1 : 0), 0);

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

// ---------- OpenAI-compatible helper ----------
async function callOpenAICompatible({ baseURL, key, model, messages, max_tokens = OUTPUT_TOKENS, temperature = 0.4 }) {
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

// --- Topic tracking function ---
function trackMessageTopics(session, message) {
  // Simple topic extraction for verified users
  const topics = [];
  
  // Look for key topics
  const topicPatterns = {
    'ai': /\b(ai|artificial intelligence|machine learning|ml|llm|model|claude|openai|gpt)\b/i,
    'programming': /\b(code|coding|programming|javascript|python|react|api|development|software)\b/i,
    'business': /\b(business|strategy|revenue|cost|optimization|market|sales|customer)\b/i,
    'data': /\b(data|database|sql|analytics|metrics|statistics|analysis)\b/i,
    'design': /\b(design|ui|ux|interface|user experience|frontend|styling)\b/i,
    'project': /\b(project|task|deadline|planning|management|timeline)\b/i,
  };
  
  for (const [topic, pattern] of Object.entries(topicPatterns)) {
    if (pattern.test(message)) {
      topics.push(topic);
    }
  }
  
  // Store topics and generate commands
  for (const topic of topics) {
    if (!session._topicSeenAt[topic]) {
      session._topicSeenAt[topic] = session.turns.length;
      session.topicCounts[topic] = (session.topicCounts[topic] || 0) + 1;
      
      // Add to commands for suggestions
      if (!session.commands) session.commands = [];
      session.commands.push({
        slug: topic,
        command: `Tell me more about ${topic}`,
        created_at: new Date().toISOString(),
        confidence: 'med'
      });
    }
  }
}

// --- SIMPLIFIED background processing - ONLY gpt-4o-mini ---
async function updateLiveNotesUltraCheap(session) {
  // Skip for guests to save costs
  if (session.isGuest) return;
  
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.warn("OpenAI API key missing - skipping live notes");
    return;
  }

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
    console.log("✅ Live notes updated for session:", session.userId);
  } catch (e) {
    console.warn("❌ Live notes failed:", e.message);
  }
}

async function consolidateSnapshotUltraCheap(session) {
  // Skip for guests
  if (session.isGuest) return;
  
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.warn("OpenAI API key missing - skipping snapshot");
    return;
  }

  const from_turn = (session.snapshots?.at(-1)?.to_turn ?? 0) + 1;
  const to_turn = session.turns.length;
  const windowTurns = session.turns.slice(Math.max(0, from_turn - 1), to_turn);

  const excerpt = buildBudgetedTurns(windowTurns, SNAPSHOT_INPUT_BUDGET)
    .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
    .join("\n");

  const prompt = `Summarize chat. Return JSON: {"topics":[{"slug":"","gloss":""}],"key_details":[],"decisions":[],"open_questions":[],"actions":[],"confidence":"med"}\n\n${excerpt}`;

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
    console.log(`🎯 Snapshot created for session ${session.userId}: ${snapshot.topics?.length || 0} topics, ${snapshot.key_details?.length || 0} details`);
  } catch (e) {
    console.warn("❌ Snapshot failed:", e.message);
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

// --- preflight ---
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: H });
}

// --- simple health/debug ---
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const userId = await getUserFromRequest(req);

  if (sessionId) {
    const authSessionKey = userId ? `${userId}:${sessionId}` : null;
    const guestSessionKey = `guest:${sessionId}`;
    const s = (authSessionKey ? SESSIONS.get(authSessionKey) : null) || SESSIONS.get(guestSessionKey);

    return Response.json(
      s ? {
        ok: true,
        inspector: { live: s.live, snapshots: s.snapshots || [], commands: s.commands || [] },
        turns: s.turns.length,
        isGuest: s.isGuest,
        userId: s.userId,
      } : {
        ok: false,
        error: "session not found",
      },
      { headers: H }
    );
  }
  
  return Response.json({
    ok: true,
    sessions: SESSIONS.size,
    userId: userId || "guest",
  }, { headers: H });
}

// --- main POST ---
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    console.log("🔍 REQUEST RECEIVED:", JSON.stringify(body, null, 2));
    
    let message = asText(body?.message ?? "");
    if (!message) return new Response("Missing message", { status: 400, headers: H });

    let sessionId = asText(body?.sessionId || "");
    if (!sessionId) {
      sessionId = crypto.randomUUID?.() || "sess_" + Math.random().toString(36).slice(2);
    }

    const userId = await getUserFromRequest(req);
    console.log("🔐 User auth:", userId ? `verified (${userId})` : "guest");
    
    const modelMeta = body?.model || {};
    const provider = asText(modelMeta?.provider || "anthropic");
    const modelName = asText(modelMeta?.model || (
      provider === "openai" ? "gpt-4o-mini" :
      provider === "gemini" ? "gemini-1.5-flash" :
      provider === "xai" ? "grok-2" :
      "claude-3-haiku-20240307"
    ));

    console.log(`🤖 Processing message for ${userId ? 'verified' : 'guest'} user with ${provider}/${modelName}`);

    // Build minimal identity system prompt only if needed
    const needsIdentity = shouldInjectIdentity(message);
    const systemIdentity = needsIdentity ? buildIdentitySystemPrompt({
      appName: APP_NAME,
      provider,
      modelName,
    }) : null;

    // 1) append user turn
    const s = getSession(sessionId, userId);
    s.turns.push({ role: "user", content: message, provider, model: modelName });
    console.log(`📝 Session now has ${s.turns.length} turns (${userTurnCount(s.turns)} user messages)`);

    // 2) call provider
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

      const requestBody = {
        model: modelName,
        max_tokens: OUTPUT_TOKENS,
        temperature: 0.4,
        messages: buildAnthropicMessages(s.turns),
      };
      
      if (needsIdentity) requestBody.system = systemIdentity;

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(requestBody),
      });
      
      const txt = await r.text();
      if (!r.ok) return new Response(`Claude ${r.status}: ${txt}`, { status: 502, headers: H });
      
      try {
        const data = JSON.parse(txt);
        assistantText = data?.content?.filter(b => b?.type === "text")?.map(b => b.text)?.join("") || "Okay.";
      } catch {
        assistantText = txt || "Okay.";
      }

    } else {
      // gemini
      const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!key) return new Response("GEMINI_API_KEY missing", { status: 500, headers: H });
      
      const genAI = new GoogleGenerativeAI(key);
      const modelConfig = { model: modelName || "gemini-1.5-flash" };
      if (needsIdentity) modelConfig.systemInstruction = systemIdentity;
      
      const model = genAI.getGenerativeModel(modelConfig);
      const history = buildGeminiHistory(s.turns);
      const result = await model.generateContent({
        contents: history,
        generationConfig: { maxOutputTokens: OUTPUT_TOKENS, temperature: 0.4 },
      });
      assistantText = result?.response?.text?.() || "Okay.";
    }

    // 3) append assistant turn
    s.turns.push({ role: "assistant", content: assistantText, provider, model: modelName });
    s.last = { provider, model: modelName };

    // 4) Background processing: Guests get NONE, Verified users get FULL functionality
    if (!s.isGuest) {
      console.log("🔥 VERIFIED USER DETECTED - Starting background processing");
      console.log("🔑 OpenAI key available:", !!process.env.OPENAI_API_KEY);
      
      await updateLiveNotesUltraCheap(s);
      
      // topic mentions - verified users only
      trackMessageTopics(s, message);
      
      // Snapshot every 5 messages for verified users
      const userTurns = userTurnCount(s.turns);
      console.log(`📊 User message count: ${userTurns} (snapshot triggers at 5, 10, 15...)`);
      
      if (userTurns > 0 && userTurns % 5 === 0) {
        console.log(`📸 SNAPSHOT TRIGGER! Creating snapshot for message ${userTurns}`);
        await consolidateSnapshotUltraCheap(s);
      }
      
      console.log(`📋 Session state: ${s.snapshots?.length || 0} snapshots, ${s.commands?.length || 0} commands`);
    } else {
      console.log("👤 Guest user - skipping background processing");
    }

    // 5) response
    const responseData = {
      text: assistantText,
      inspector: { live: s.live, snapshots: s.snapshots || [], commands: s.commands || [] },
      sessionMeta: { 
        isGuest: s.isGuest, 
        userId: s.userId,
        provider,
        model: modelName,
      },
    };
    
    console.log("📤 Sending response with inspector data:", {
      snapshots: responseData.inspector.snapshots.length,
      commands: responseData.inspector.commands.length,
      live: Object.keys(responseData.inspector.live).length
    });

    return new Response(
      JSON.stringify(responseData),
      { status: 200, headers: { ...H, "Content-Type": "application/json; charset=utf-8", "X-Session-Id": sessionId } }
    );
  } catch (e) {
    console.error("💥 Session error:", e);
    return new Response(`Session error: ${e?.message || String(e)}`, { status: 500, headers: H });
  }
}