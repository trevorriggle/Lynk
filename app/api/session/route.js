// app/api/session/route.js
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
    `- ${appName} is an amalgamation of many LLMs, allowing users to switch between different AI providers seamlessly.`,
    `- For THIS conversation, your current underlying model is: provider="${provider}", model="${modelName}".`,
    `- If asked about your identity, reply: "I'm ${appName}. This chat is currently powered by ${provider} ${modelName} via ${appName}."`,
    `- You can switch between OpenAI, Anthropic, Google/Gemini, xAI, and other providers mid-conversation.`,
    `- Do NOT claim to be exclusively Google/Gemini/Anthropic/OpenAI/xAI - you're ${appName}, powered by whichever provider is active.`,
    `- If users ask about available models, mention that ${appName} offers access to multiple LLM providers.`,
    `- Your strength is model flexibility - you can leverage different AI capabilities depending on the task.`,
    `- Refer to yourself as "${appName}" (not ChatGPT, Claude, Gemini, etc.).`,
  ].join("\n");
}

// --- cost guards ---
const INPUT_TOKEN_BUDGET = 1500; // context budget for main chat
const OUTPUT_TOKENS = 800;       // reply cap (prevents cutoffs)
const estTokens = (s) => Math.ceil((s || "").length / 4);

// --- snapshot caps (keep cheap) ---
const SNAPSHOT_INPUT_BUDGET = 700;   // approx input window to summarize
const SNAPSHOT_OUTPUT_TOKENS = 200;  // strict cap; JSON-only output

// --- Session store with user isolation ---
// Session: { turns, last, live, topicCounts, commands, snapshots?, userId?, _topicSeenAt?, commandState? }
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
      _topicSeenAt: {},   // slug -> last user turn index counted
      commandState: {},   // slug -> { nextAt: number }
    });
  }
  return SESSIONS.get(sessionKey);
};

// --- auth helper: infer user from cookies via /api/me (adjust to your stack) ---
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
function userTurnIndex(session) {
  return userTurnCount(session.turns); // 1-based (after pushing user turn)
}

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

// ---------- OpenAI-compatible helper (xAI/Groq/etc.) ----------
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
  const data = safeParseJson(txt);
  return data?.choices?.[0]?.message?.content?.toString?.() || "Okay.";
}

// ---------- Commands: threshold + progressive triggers ----------
const COMMAND_THRESHOLD = 3;

function normalizeSlug(v) {
  if (!v) return "";
  const s = String(v).trim().toLowerCase();
  return s
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Count one mention per slug per *user turn*, then evaluate triggers
function markTopicMention(session, slug) {
  if (!slug) return;
  const turn = userTurnIndex(session);
  const seenAt = (session._topicSeenAt ||= {});
  if (seenAt[slug] === turn) return; // already counted this slug for this user turn
  seenAt[slug] = turn;
  session.topicCounts[slug] = (session.topicCounts[slug] || 0) + 1;
  maybeSuggestCommand(session, slug);
}

// Fire at 3, then again at 6, 9, 12, ...
function maybeSuggestCommand(session, slug) {
  const n = session.topicCounts[slug] || 0;
  const st = (session.commandState ||= {});
  const nextAt = st[slug]?.nextAt ?? COMMAND_THRESHOLD;
  if (n >= nextAt) {
    (session.commands ||= []).push({
      slug,
      command: `${slug}?`,
      count: n,
      created_at: new Date().toISOString(),
    });
    st[slug] = { nextAt: nextAt + COMMAND_THRESHOLD };
  }
}

// Lightweight topic scrape from the raw user message
function trackMessageTopics(session, message) {
  const text = asText(message || "");
  const slugs = new Set();

  // 1) hashtags like #fort-rapids #pricing
  for (const m of text.matchAll(/#([a-z0-9][\w-]{1,60})/gi)) {
    slugs.add(normalizeSlug(m[1]));
  }
  // 2) quoted phrases => "fort rapids" → fort-rapids
  for (const m of text.matchAll(/"([^"]{2,80})"/g)) {
    slugs.add(normalizeSlug(m[1]));
  }
  // 3) simple keywords >3 chars (basic stopword trim)
  const stop = new Set([
    "the","and","for","that","with","this","from","your","you","are","was","have","will","into","about","just","like",
    "then","than","they","what","when","where","why","how","who","which","also","over","under","after","before",
  ]);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stop.has(w))
    .slice(0, 6);
  for (const w of words) slugs.add(normalizeSlug(w));

  for (const slug of slugs) if (slug) markTopicMention(session, slug);
}

// ---------- Live Notes + Topics -> Commands ----------
async function updateLiveNotes(session, provider, modelName) {
  const lastTurns = buildBudgetedTurns(session.turns, 600);
  const chatExcerpt = lastTurns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join("\n");

  const prompt = [
    "You are the Inspector. Update live notes for this chat turn.",
    "Return STRICT JSON with keys:",
    '  - "gist": (string, <= 1 sentence)',
    '  - "key_points": (array, <= 4 short bullets)',
    '  - "todos": (array of strings, empty if none)',
    '  - "entities": (array of short labels/names)',
    '  - "topics": (array of short, lowercase slugs; hyphenate multiword, e.g., \"fort-rapids\")',
    "",
    "Respond with JSON only. No prose.",
    "",
    "Chat excerpt:",
    chatExcerpt,
  ].join("\n");

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

    } else if (provider === "anthropic") {
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
      const data = safeParseJson(txt);
      const onlyText = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
      const obj = JSON.parse(extractJson(onlyText));
      mergeLive(session, obj);

    } else if (provider === "xai") {
      const key = process.env.XAI_API_KEY;
      if (!key) return;
      const assistantText = await callOpenAIMessagesOnce({
        baseURL: "https://api.x.ai/v1",
        key,
        model: modelName,
        system: "Return only valid JSON. No explanations.",
        user: prompt,
        max_tokens: 128,
        temperature: 0.2,
      });
      const obj = JSON.parse(extractJson(assistantText));
      mergeLive(session, obj);

    } else {
      // gemini
      const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!key) return;
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: modelName || "gemini-1.5-flash" });
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: "Return only valid JSON. No explanations.\n\n" + prompt }] }],
        generationConfig: { maxOutputTokens: 128, temperature: 0.2 },
      });
      const raw = result?.response?.text?.() || "";
      const obj = JSON.parse(extractJson(raw));
      mergeLive(session, obj);
    }
  } catch {
    // keep prior live notes on failure
  }
}

function mergeLive(session, obj) {
  const live = session.live || (session.live = { gist: "", key_points: [], todos: [], entities: [] });
  if (typeof obj?.gist === "string") live.gist = obj.gist;
  if (Array.isArray(obj?.key_points)) live.key_points = obj.key_points.slice(0, 4);
  if (Array.isArray(obj?.todos)) live.todos = obj.todos.slice(0, 8);
  if (Array.isArray(obj?.entities)) live.entities = obj.entities.slice(0, 8);

  if (Array.isArray(obj?.topics)) {
    for (const raw of obj.topics) {
      const slug = normalizeSlug(raw?.slug ?? raw);
      if (!slug) continue;
      markTopicMention(session, slug);
    }
  }
}

// Consolidate a compact snapshot for the last window (triggered every 5 user turns)
async function consolidateSnapshot(session, provider, modelName) {
  const from_turn = (session.snapshots?.at(-1)?.to_turn ?? 0) + 1;
  const to_turn = session.turns.length;
  const windowTurns = session.turns.slice(Math.max(0, from_turn - 1), to_turn);

  const excerpt = buildBudgetedTurns(windowTurns, SNAPSHOT_INPUT_BUDGET)
    .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
    .join("\n");

  const schemaPrompt = [
    "You are a conversation summarizer. Create a JSON summary of this chat window.",
    "",
    "IMPORTANT: You must return valid JSON with these exact keys:",
    '{',
    '  "topics": [{"slug": "topic-name", "gloss": "brief description"}],',
    '  "key_details": ["important fact 1", "important fact 2"],',
    '  "decisions": ["decision made"],',
    '  "open_questions": ["question 1", "question 2"],',
    '  "actions": [{"text": "action item", "owner": "who"}],',
    '  "entities": ["name1", "name2"],',
    '  "links": ["url1"],',
    '  "confidence": "med"',
    '}',
    "",
    "Even if the conversation is simple, try to extract at least 1-2 items for topics and key_details.",
    "If you can't find content for a section, use an empty array [].",
    "",
    "Chat window:",
    excerpt,
  ].join("\n");

  let jsonText = "{}";
  try {
    if (provider === "openai") {
      const key = process.env.OPENAI_API_KEY; if (!key) return;
      const client = new OpenAI({ apiKey: key });
      const r = await client.chat.completions.create({
        model: modelName,
        temperature: 0.1,
        max_tokens: SNAPSHOT_OUTPUT_TOKENS,
        messages: [
          { role: "system", content: "Return ONLY valid JSON. No explanations." },
          { role: "user", content: schemaPrompt },
        ],
      });
      jsonText = r?.choices?.[0]?.message?.content?.toString?.() || "{}";

    } else if (provider === "anthropic") {
      const key = process.env.ANTHROPIC_API_KEY; if (!key) return;
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelName,
          temperature: 0.1,
          max_tokens: SNAPSHOT_OUTPUT_TOKENS,
          messages: [{ role: "user", content: [{ type: "text", text: "Return ONLY valid JSON. No explanations.\n\n" + schemaPrompt }] }],
        }),
      });
      const txt = await r.text();
      const data = safeParseJson(txt);
      jsonText = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("") || "{}";

    } else if (provider === "xai") {
      const key = process.env.XAI_API_KEY; if (!key) return;
      jsonText = await callOpenAIMessagesOnce({
        baseURL: "https://api.x.ai/v1",
        key,
        model: modelName,
        system: "Return ONLY valid JSON. No explanations.",
        user: schemaPrompt,
        temperature: 0.1,
        max_tokens: SNAPSHOT_OUTPUT_TOKENS,
      });

    } else {
      const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY; if (!key) return;
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: modelName || "gemini-1.5-flash" });
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: "Return ONLY valid JSON. No explanations.\n\n" + schemaPrompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: SNAPSHOT_OUTPUT_TOKENS },
      });
      jsonText = result?.response?.text?.() || "{}";
    }
  } catch {
    // swallow & keep minimal
  }

  const obj = safeParseJson(extractJson(jsonText)) || {};

  const cap = (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []);
  let topics = cap(obj.topics, 5)
    .map((x) => ({ slug: normalizeSlug(x?.slug ?? x), gloss: String(x?.gloss || "").slice(0, 120) }))
    .filter((t) => t.slug);

  if (topics.length === 0 && excerpt.length > 50) {
    topics = [
      { slug: "conversation-topic", gloss: "General discussion" },
      { slug: "user-interaction", gloss: "User questions and responses" },
    ];
  }

  let keyDetails = cap(obj.key_details, 5).map((s) => String(s).slice(0, 120)).filter(Boolean);
  if (keyDetails.length === 0 && excerpt.length > 50) {
    keyDetails = ["Conversation between user and AI assistant", "Multiple exchanges covering various topics"];
  }

  const snapshot = {
    created_at: new Date().toISOString(),
    model: { provider, model: modelName },
    from_turn,
    to_turn,
    topics,
    key_details: keyDetails,
    decisions: cap(obj.decisions, 3).map((s) => String(s).slice(0, 120)).filter(Boolean),
    open_questions: cap(obj.open_questions, 3).map((s) => String(s).slice(0, 120)).filter(Boolean),
    actions: cap(obj.actions, 5)
      .map((a) => ({ text: String(a?.text ?? a).slice(0, 120), owner: a?.owner ? String(a.owner).slice(0, 40) : undefined }))
      .filter((a) => a.text),
    entities: cap(obj.entities, 8).map((s) => String(s).slice(0, 60)).filter(Boolean),
    links: cap(obj.links, 5).map((s) => String(s).slice(0, 200)).filter(Boolean),
    confidence: ["low", "med", "high"].includes(obj.confidence) ? obj.confidence : "med",
  };

  (session.snapshots ||= []).push(snapshot);
  for (const t of topics) markTopicMention(session, t.slug);
}

// small helper to call OAI-compatible with system+user in one go
async function callOpenAIMessagesOnce({ baseURL, key, model, system, user, max_tokens, temperature }) {
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: user },
      ],
      temperature,
      max_tokens,
    }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`OpenAI-compatible ${res.status}: ${txt}`);
  const data = safeParseJson(txt);
  return data?.choices?.[0]?.message?.content?.toString?.() || "Okay.";
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
    const simpleKey = sessionId;

    const authSession = authSessionKey ? SESSIONS.get(authSessionKey) : null;
    const guestSession = SESSIONS.get(guestSessionKey);
    const simpleSession = SESSIONS.get(simpleKey);

    const s = authSession || guestSession || simpleSession;

    return Response.json(
      s
        ? {
            ok: true,
            inspector: { live: s.live, snapshots: s.snapshots || [], commands: s.commands || [] },
            turns: s.turns.length,
            isGuest: s.isGuest,
            userId: s.userId,
            debug: {
              requestUserId: userId,
              triedKeys: { auth: authSessionKey, guest: guestSessionKey, simple: simpleKey },
              foundWith: authSession ? "auth" : guestSession ? "guest" : "simple",
              allSessionKeys: Array.from(SESSIONS.keys()),
            },
          }
        : {
            ok: false,
            error: "session not found",
            debug: { requestUserId: userId, searchedFor: sessionId, allSessionKeys: Array.from(SESSIONS.keys()) },
          },
      { headers: H }
    );
  }
  return Response.json(
    {
      ok: true,
      sessions: SESSIONS.size,
      now: new Date().toISOString(),
      expects: "POST { sessionId, message, model: { label, provider, model } }",
      userId: userId || "guest",
      allSessionKeys: Array.from(SESSIONS.keys()),
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

    let sessionId = asText(body?.sessionId || "");
    if (!sessionId) {
      try {
        sessionId = crypto.randomUUID();
      } catch {
        sessionId = "sess_" + Math.random().toString(36).slice(2);
      }
    }

    const userId = await getUserFromRequest(req);

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

    // Build identity system prompt only if needed (saves ~120 tokens per message)
    const needsIdentity = shouldInjectIdentity(message);
    const systemIdentity = needsIdentity ? buildIdentitySystemPrompt({
      appName: APP_NAME,
      provider,
      modelName,
    }) : null;

    // 1) append user turn
    const s = getSession(sessionId, userId);
    s.turns.push({ role: "user", content: message, provider, model: modelName });

    // topic mentions (per-turn de-duped)
    trackMessageTopics(s, message);

    // 2) call provider with conditional identity system
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
      
      if (r?.choices?.[0]?.finish_reason === "length") {
        const contMessages = needsIdentity 
          ? [{ role: "system", content: systemIdentity }, ...buildOpenAIMessages(s.turns), { role: "assistant", content: assistantText }, { role: "user", content: "Continue your previous reply." }]
          : [...buildOpenAIMessages(s.turns), { role: "assistant", content: assistantText }, { role: "user", content: "Continue your previous reply." }];
          
        const cont = await client.chat.completions.create({
          model: modelName,
          max_tokens: OUTPUT_TOKENS,
          temperature: 0.4,
          messages: contMessages,
        });
        assistantText += cont?.choices?.[0]?.message?.content?.toString?.() || "";
      }

    } else if (provider === "anthropic") {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return new Response("ANTHROPIC_API_KEY missing", { status: 500, headers: H });

      const requestBody = {
        model: modelName,
        max_tokens: OUTPUT_TOKENS,
        temperature: 0.4,
        messages: buildAnthropicMessages(s.turns),
      };
      
      if (needsIdentity) {
        requestBody.system = systemIdentity;
      }

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
        for (const b of data?.content || []) if (b?.type === "text" && b?.text) assistantText += b.text;
        if (data?.stop_reason === "max_tokens") {
          const contRequestBody = {
            model: modelName,
            max_tokens: OUTPUT_TOKENS,
            temperature: 0.4,
            messages: [
              ...buildAnthropicMessages(s.turns),
              { role: "assistant", content: [{ type: "text", text: assistantText }] },
              { role: "user", content: [{ type: "text", text: "Continue your previous reply." }] },
            ],
          };
          
          if (needsIdentity) {
            contRequestBody.system = systemIdentity;
          }
          
          const r2 = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify(contRequestBody),
          });
          const txt2 = await r2.text();
          try {
            const data2 = JSON.parse(txt2);
            for (const b of data2?.content || []) if (b?.type === "text" && b?.text) assistantText += b.text;
          } catch {
            assistantText += "\n" + txt2;
          }
        }
      } catch {
        assistantText = txt || "Okay.";
      }

    } else {
      // gemini
      const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!key) return new Response("GEMINI_API_KEY missing", { status: 500, headers: H });
      const genAI = new GoogleGenerativeAI(key);
      
      const modelConfig = { model: modelName || "gemini-1.5-flash" };
      if (needsIdentity) {
        modelConfig.systemInstruction = systemIdentity;
      }
      
      const model = genAI.getGenerativeModel(modelConfig);
      const history = buildGeminiHistory(s.turns);
      const result = await model.generateContent({
        contents: history,
        generationConfig: { maxOutputTokens: OUTPUT_TOKENS, temperature: 0.4 },
      });
      assistantText = result?.response?.text?.() || "Okay.";
      // continuation skipped for Gemini
    }

    // 3) append assistant turn
    s.turns.push({ role: "assistant", content: assistantText, provider, model: modelName });
    s.last = { provider, model: modelName };

    // 4) update live notes (cheap)
    await updateLiveNotes(s, provider, modelName);

    // 5) periodic snapshot every 5 user turns
    const users = userTurnCount(s.turns);
    if (users > 0 && users % 5 === 0) {
      await consolidateSnapshot(s, provider, modelName);
    }

    // 6) response
    return new Response(
      JSON.stringify({
        text: assistantText,
        inspector: { live: s.live, snapshots: s.snapshots || [], commands: s.commands || [] },
        sessionMeta: { 
          isGuest: s.isGuest, 
          userId: s.userId,
          provider,
          model: modelName,
        },
      }),
      { status: 200, headers: { ...H, "Content-Type": "application/json; charset=utf-8", "X-Session-Id": sessionId } }
    );
  } catch (e) {
    return new Response(`Session error: ${e?.message || String(e)}`, { status: 500, headers: H });
  }
}