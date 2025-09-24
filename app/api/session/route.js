// app/api/session/route.js — Persistent sessions, server-side quotas, identity injection, and observability

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getUserTier,
  getSession,
  createSession,
  updateSession,
  addSessionTurn,
  addSessionSnapshot,
  addSessionCommand,
  getUserQuota,
  incrementUserQuota,
  logRequest
} from "../../../lib/database.js";

// ---------- Headers ----------
const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "X-Lynk-Route": "session",
};

// Tighten CORS for production (TODO: Update for production deployment)
const PRODUCTION_HEADERS = {
  ...H,
  "Access-Control-Allow-Origin": process.env.NODE_ENV === "production"
    ? process.env.FRONTEND_URL || "https://lynk.chat"
    : "*"
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

// ---------- Tier Configuration ----------
const TIER_LIMITS = {
  FREE_GUEST: {
    dailyMessages: 10,
    outputTokens: 300,
    visionRequestsPerMonth: 0,
    liveNotesPerMonth: 0,
    commandSuggestions: false,
    permanentSessions: false,
    sessionTTLHours: 24
  },
  FREE_VERIFIED: {
    dailyMessages: 25,
    outputTokens: 600,
    visionRequestsPerMonth: 2,
    liveNotesPerMonth: 2,
    commandSuggestions: true,
    permanentSessions: true,
    sessionTTLHours: null
  },
  PRO: {
    dailyMessages: Infinity,
    outputTokens: 1200,
    visionRequestsPerMonth: Infinity,
    liveNotesPerMonth: Infinity,
    commandSuggestions: true,
    permanentSessions: true,
    sessionTTLHours: null
  }
};

// ---------- Rate Limiting & Abuse Protection ----------
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;
const MAX_PROMPT_LENGTH = 8000;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

// In-memory rate limiting (TODO: Use Redis for production scale)
const rateLimitStore = new Map();

function checkRateLimit(identifier) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  if (!rateLimitStore.has(identifier)) {
    rateLimitStore.set(identifier, []);
  }

  const requests = rateLimitStore.get(identifier);
  const validRequests = requests.filter(timestamp => timestamp > windowStart);

  if (validRequests.length >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  validRequests.push(now);
  rateLimitStore.set(identifier, validRequests);

  // Cleanup old entries periodically
  if (Math.random() < 0.01) {
    for (const [key, timestamps] of rateLimitStore.entries()) {
      const valid = timestamps.filter(t => t > windowStart);
      if (valid.length === 0) {
        rateLimitStore.delete(key);
      } else {
        rateLimitStore.set(key, valid);
      }
    }
  }

  return true;
}

// ---------- Budgets ----------
const INPUT_TOKEN_BUDGET = 1200;
const LIVE_NOTES_BUDGET = 800;
const LIVE_NOTES_TOKENS = 150;
const BACKGROUND_MODEL = "gpt-4o-mini";
const BACKGROUND_TEMP = 0.1;

const estTokens = (s) => Math.ceil((s || "").length / 3.8);

function getTierLimits(tier) {
  return TIER_LIMITS[tier] || TIER_LIMITS.FREE_GUEST;
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
    return {
      userId: j.userId || null,
      tier: j.tier || "FREE_VERIFIED" // me endpoint determines tier
    };
  } catch {
    return null;
  }
}

// ---------- Prompt guards ----------
function shouldInjectIdentity(message) {
  const triggers = [
    /(^|\b)(who are you|what (are you|model)|what ai|what is lynk|which model|are you (openai|claude|gemini)|what provider)(\b|$)/i,
  ];
  return triggers.some((re) => re.test(message || ""));
}

// ---------- Vision Processing ----------
async function processImageWithVision(imageDataURL, message, provider, modelName, userInfo) {
  const tier = await getUserTier(userInfo?.userId);
  const limits = getTierLimits(tier);

  if (limits.visionRequestsPerMonth === 0) {
    return "Vision analysis is available for verified email accounts and Pro users. Sign up or upgrade to analyze images.";
  }

  // Check monthly vision quota
  if (limits.visionRequestsPerMonth !== Infinity && userInfo?.userId) {
    const currentQuota = await getUserQuota(userInfo.userId, 'monthly_vision');
    if (currentQuota >= limits.visionRequestsPerMonth) {
      return limits.visionRequestsPerMonth === 2
        ? "You've used your 2 monthly vision requests. Upgrade to Pro for unlimited vision analysis!"
        : `You've reached your monthly vision limit (${limits.visionRequestsPerMonth}). Please upgrade your plan.`;
    }
  }

  try {
    let result = "";

    if (provider === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return "I can see you've shared an image, but OpenAI vision isn't configured.";

      const client = new OpenAI({ apiKey: key });
      const visionModel = modelName === "gpt-4o" ? "gpt-4o" : "gpt-4o";

      const response = await client.chat.completions.create({
        model: visionModel,
        max_tokens: limits.outputTokens,
        temperature: 0.4,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: message || "What do you see in this image? Please describe it in detail." },
            { type: "image_url", image_url: { url: imageDataURL } }
          ]
        }]
      });

      result = response?.choices?.[0]?.message?.content || "I can see the image but couldn't generate a response.";

    } else if (provider === "anthropic") {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return "I can see you've shared an image, but Claude vision isn't configured.";

      const base64Match = imageDataURL.match(/^data:image\/[^;]+;base64,(.+)$/);
      if (!base64Match) return "Invalid image format for Claude vision.";

      const base64Data = base64Match[1];
      const mediaType = imageDataURL.match(/^data:(image\/[^;]+)/)?.[1] || "image/png";

      const payload = {
        model: "claude-3-sonnet-20240229",
        max_tokens: limits.outputTokens,
        temperature: 0.4,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
            { type: "text", text: message || "What do you see in this image? Please describe it in detail." }
          ]
        }]
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
      if (!r.ok) return `Claude vision error: ${txt}`;

      try {
        const data = JSON.parse(txt);
        result = (data?.content || [])
          .filter((b) => b?.type === "text")
          .map((b) => b.text)
          .join("") || "I can see the image but couldn't generate a response.";
      } catch {
        result = txt || "I can see the image but couldn't generate a response.";
      }

    } else if (provider === "gemini") {
      const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!key) return "I can see you've shared an image, but Gemini vision isn't configured.";

      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const base64Match = imageDataURL.match(/^data:image\/[^;]+;base64,(.+)$/);
      if (!base64Match) return "Invalid image format for Gemini vision.";

      const base64Data = base64Match[1];
      const mimeType = imageDataURL.match(/^data:(image\/[^;]+)/)?.[1] || "image/png";

      const imagePart = {
        inlineData: { data: base64Data, mimeType }
      };

      const textPart = message || "What do you see in this image? Please describe it in detail.";
      const genResult = await model.generateContent([textPart, imagePart]);
      result = genResult?.response?.text?.() || "I can see the image but couldn't generate a response.";

    } else {
      return `I can see you've shared an image, but vision analysis isn't currently supported with ${provider}. Please switch to OpenAI, Claude, or Gemini to analyze images.`;
    }

    // Increment vision quota after successful processing
    if (userInfo?.userId && limits.visionRequestsPerMonth !== Infinity) {
      await incrementUserQuota(userInfo.userId, 'monthly_vision');
    }

    return result;

  } catch (error) {
    console.error("Vision processing error:", error);
    return "I can see the image but encountered an error analyzing it.";
  }
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
  max_tokens = 600,
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

    if (c === 4) {
      const command = {
        slug: k,
        command: `${k} best practices`,
        confidence: "high",
        created_at: new Date().toISOString()
      };
      session.commands.push(command);
      // Also persist to database
      addSessionCommand(session.id, command.slug, command.command, command.confidence);
    }
  }
}

// ---------- Enhanced Live Notes Generation ----------
async function generateLiveNotes(turns, fromTurn, toTurn) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return createDetailedFallbackNotes(turns);
  }

  try {
    const relevantTurns = buildBudgetedTurns(turns, LIVE_NOTES_BUDGET);
    const chat = relevantTurns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join("\n");

    const client = new OpenAI({ apiKey: key });
    const system = "Return *only* strict JSON. Be concise and specific.";
    const user = `Analyze user turns ${fromTurn}-${toTurn} and produce notes.

SCHEMA:
{
  "key_topics": ["topic1", "topic2", "topic3"],
  "discussion": "2-3 sentences summarizing the main discussion points and outcomes"
}

Extract the actual topics discussed (not generic categories). For discussion, focus on what was specifically covered, decided, or learned.

Conversation:
${chat}`;

    const response = await runWithTimeout(
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

    const raw = response?.choices?.[0]?.message?.content?.toString?.() || "{}";
    const obj = JSON.parse(extractJson(raw));

    return {
      key_topics: Array.isArray(obj?.key_topics) ? obj.key_topics.slice(0, 3) : [],
      discussion: typeof obj?.discussion === "string" ? obj.discussion : "",
    };
  } catch (error) {
    return createDetailedFallbackNotes(turns);
  }
}

function createDetailedFallbackNotes(turns) {
  const recent = turns.slice(-16);
  const userMsgs = recent.filter((t) => t.role === "user").map((t) => t.content || "");
  const asstMsgs = recent.filter((t) => t.role === "assistant").map((t) => t.content || "");
  const allContent = [...userMsgs, ...asstMsgs].join(" ").replace(/\s+/g, " ").trim();

  const lc = allContent.toLowerCase();

  const topics = [];
  if (/\b(ui|ux|design|layout|typography|component|grid|style|visual|interface)\b/.test(lc)) topics.push("Design");
  if (/\b(code|javascript|python|react|api|function|programming|development|software|debug)\b/.test(lc)) topics.push("Programming");
  if (/\b(data|metric|chart|dashboard|analytics|sql|database|visualization)\b/.test(lc)) topics.push("Data");
  if (/\b(market|pricing|sales|cost|roi|plan|timeline|business|strategy|revenue)\b/.test(lc)) topics.push("Business");
  if (/\b(model|ai|gpt|claude|gemini|token|embedding|machine learning|neural)\b/.test(lc)) topics.push("AI");
  if (/\b(user|customer|feedback|experience|testing|research|interview)\b/.test(lc)) topics.push("User Research");
  if (/\b(project|management|agile|scrum|sprint|delivery|roadmap)\b/.test(lc)) topics.push("Project Management");

  const entities = [];
  const words = allContent.match(/\b[A-Z][a-zA-Z0-9\-]*\b/g) || [];
  const commonWords = new Set(['I', 'We', 'You', 'They', 'It', 'The', 'A', 'An', 'And', 'Or', 'Of', 'To', 'In', 'On', 'For', 'With', 'By', 'At', 'As', 'This', 'That', 'These', 'Those', 'My', 'Your', 'Our', 'Their', 'He', 'She', 'His', 'Her', 'Its', 'But', 'Not', 'Are', 'Is', 'Was', 'Were', 'Be', 'Been', 'Being', 'Have', 'Has', 'Had', 'Do', 'Does', 'Did', 'Will', 'Would', 'Could', 'Should', 'May', 'Might', 'Can', 'Must']);

  for (const word of words) {
    if (!commonWords.has(word) && word.length > 2) {
      entities.push(word);
    }
  }

  const uniqueEntities = Array.from(new Set(entities)).slice(0, 6);

  if (topics.length === 0 && uniqueEntities.length > 0) {
    topics.push(...uniqueEntities.slice(0, 3));
  }
  if (topics.length === 0) topics.push("General Discussion");

  const topicSummary = topics.length > 0 ? topics.slice(0, 2).join(" and ") : "general conversation";
  const discussion = `Discussion covering ${topicSummary} with ${userMsgs.length} user interactions. ${
    uniqueEntities.length > 0
      ? `Key topics included ${uniqueEntities.slice(0, 3).join(", ")}.`
      : "Interactive conversation with knowledge sharing and exploration."
  }`;

  return {
    key_topics: topics.slice(0, 3),
    discussion: discussion,
  };
}

const asText = (x) => (typeof x === "string" ? x : String(x ?? ""));

// ---------- Routes ----------
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: PRODUCTION_HEADERS });
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const userInfo = await getUserFromRequest(req);
  const userTier = await getUserTier(userInfo?.userId);

  if (!sessionId) {
    return Response.json(
      {
        ok: true,
        userId: userInfo?.userId || "guest",
        tier: userTier,
        limits: getTierLimits(userTier)
      },
      { headers: PRODUCTION_HEADERS }
    );
  }

  try {
    const session = await getSession(sessionId, userInfo?.userId);

    if (!session) {
      return Response.json(
        { ok: false, error: "Session not found" },
        { status: 404, headers: PRODUCTION_HEADERS }
      );
    }

    return Response.json(
      {
        ok: true,
        inspector: {
          live_history: session.liveHistory || [],
          commands: session.commands || [],
          topicCounts: session.topicCounts || {},
        },
        session: {
          id: session.id,
          turns: session.turns.length,
          userTurns: userTurnCount(session.turns),
          isGuest: session.isGuest,
          userId: session.userId,
          createdAt: session.createdAt,
          tier: userTier,
        },
      },
      { headers: PRODUCTION_HEADERS }
    );
  } catch (error) {
    console.error("GET session error:", error);
    return Response.json(
      { ok: false, error: "Failed to fetch session" },
      { status: 500, headers: PRODUCTION_HEADERS }
    );
  }
}

export async function POST(req) {
  const startTime = Date.now();
  let userId = null;
  let sessionId = null;
  let provider = null;
  let model = null;
  let tier = null;
  let limitHit = false;
  let error = null;

  try {
    // Input validation and abuse protection
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const body = await req.json().catch(() => ({}));
    const message = asText(body?.message ?? "");

    if (!message) {
      return new Response(JSON.stringify({
        error: "Missing message",
        friendly: "Please provide a message to send."
      }), {
        status: 400,
        headers: { ...PRODUCTION_HEADERS, "Content-Type": "application/json" }
      });
    }

    if (message.length > MAX_PROMPT_LENGTH) {
      return new Response(JSON.stringify({
        error: "Message too long",
        friendly: `Message must be under ${MAX_PROMPT_LENGTH} characters. Please shorten your message and try again.`
      }), {
        status: 400,
        headers: { ...PRODUCTION_HEADERS, "Content-Type": "application/json" }
      });
    }

    sessionId = asText(body?.sessionId || "");
    if (!sessionId) sessionId = crypto.randomUUID?.() || "sess_" + Math.random().toString(36).slice(2);

    const userInfo = await getUserFromRequest(req);
    userId = userInfo?.userId;
    tier = await getUserTier(userId);
    const tierLimits = getTierLimits(tier);

    // Rate limiting
    const rateLimitKey = userId || clientIp;
    if (!checkRateLimit(rateLimitKey)) {
      limitHit = true;
      return new Response(JSON.stringify({
        error: "Rate limit exceeded",
        friendly: "You're sending messages too quickly. Please wait a moment and try again."
      }), {
        status: 429,
        headers: { ...PRODUCTION_HEADERS, "Content-Type": "application/json" }
      });
    }

    // Check daily message quota BEFORE processing
    if (tierLimits.dailyMessages !== Infinity && userId) {
      const currentQuota = await getUserQuota(userId, 'daily_messages');
      if (currentQuota >= tierLimits.dailyMessages) {
        limitHit = true;
        const friendlyMessage = tier === 'FREE_GUEST'
          ? "You've reached your daily limit of 10 messages. Please verify your email to get 25 messages per day!"
          : tier === 'FREE_VERIFIED'
          ? "You've used your 25 daily messages. Upgrade to Pro for unlimited messages!"
          : `You've reached your daily message limit (${tierLimits.dailyMessages}). Please upgrade your plan.`;

        return new Response(JSON.stringify({
          error: "Daily message limit exceeded",
          friendly: friendlyMessage,
          upgrade: tier === 'FREE_GUEST' ? 'verify' : 'pro'
        }), {
          status: 429,
          headers: { ...PRODUCTION_HEADERS, "Content-Type": "application/json" }
        });
      }
    }

    const modelMeta = body?.model || {};
    provider = asText(modelMeta?.provider || "anthropic");
    model = asText(
      modelMeta?.model ||
        (provider === "openai"
          ? "gpt-4o-mini"
          : provider === "gemini"
          ? "gemini-1.5-flash"
          : provider === "xai"
          ? "grok-2"
          : "claude-3-haiku-20240307")
    );

    // Load or create session
    let session = await getSession(sessionId, userId);
    if (!session) {
      session = await createSession(sessionId, userId, tier);
    }

    // Check attachments
    const attachments = body?.attachments || [];
    const hasImageAttachment = attachments.some(att => att.type === "image");

    if (hasImageAttachment) {
      for (const att of attachments.filter(a => a.type === "image")) {
        if (att.data && att.data.length > MAX_IMAGE_SIZE) {
          return new Response(JSON.stringify({
            error: "Image too large",
            friendly: "Please upload images smaller than 10MB."
          }), {
            status: 400,
            headers: { ...PRODUCTION_HEADERS, "Content-Type": "application/json" }
          });
        }
      }
    }

    const needsIdentity = shouldInjectIdentity(message);
    const systemIdentity = needsIdentity
      ? buildIdentitySystemPrompt({ appName: APP_NAME, provider, modelName: model })
      : null;

    // Add user turn to session
    await addSessionTurn(sessionId, "user", message, provider, model);
    session.turns.push({
      role: "user",
      content: message,
      provider,
      model,
      timestamp: new Date().toISOString(),
    });

    // ---- Handle vision processing or regular provider calls ----
    let assistantText = "";

    if (hasImageAttachment) {
      const imageAttachment = attachments.find(att => att.type === "image");
      assistantText = await processImageWithVision(imageAttachment.data, message, provider, model, userInfo);
    } else {
      // Regular text-only processing
      if (provider === "xai") {
        const key = process.env.XAI_API_KEY;
        if (!key) return new Response("XAI_API_KEY missing", { status: 500, headers: PRODUCTION_HEADERS });
        const messages = needsIdentity
          ? [{ role: "system", content: systemIdentity }, ...buildOpenAIMessages(session.turns)]
          : buildOpenAIMessages(session.turns);
        assistantText = await callOpenAICompatible({
          baseURL: "https://api.x.ai/v1",
          key,
          model,
          messages,
          max_tokens: tierLimits.outputTokens,
          temperature: 0.4,
        });
      } else if (provider === "openai") {
        const key = process.env.OPENAI_API_KEY;
        if (!key) return new Response("OPENAI_API_KEY missing", { status: 500, headers: PRODUCTION_HEADERS });
        const client = new OpenAI({ apiKey: key });
        const messages = needsIdentity
          ? [{ role: "system", content: systemIdentity }, ...buildOpenAIMessages(session.turns)]
          : buildOpenAIMessages(session.turns);
        const r = await client.chat.completions.create({
          model,
          max_tokens: tierLimits.outputTokens,
          temperature: 0.4,
          messages,
        });
        assistantText = r?.choices?.[0]?.message?.content?.toString?.() || "Okay.";
      } else if (provider === "anthropic") {
        const key = process.env.ANTHROPIC_API_KEY;
        if (!key) return new Response("ANTHROPIC_API_KEY missing", { status: 500, headers: PRODUCTION_HEADERS });
        const payload = {
          model,
          max_tokens: tierLimits.outputTokens,
          temperature: 0.4,
          messages: buildAnthropicMessages(session.turns),
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
        if (!r.ok) return new Response(`Claude ${r.status}: ${txt}`, { status: 502, headers: PRODUCTION_HEADERS });
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
        if (!key) return new Response("GEMINI_API_KEY missing", { status: 500, headers: PRODUCTION_HEADERS });
        const genAI = new GoogleGenerativeAI(key);
        const cfg = { model: model || "gemini-1.5-flash" };
        if (needsIdentity) cfg.systemInstruction = systemIdentity;
        const genModel = genAI.getGenerativeModel(cfg);
        const history = buildGeminiHistory(session.turns);
        const result = await genModel.generateContent({
          contents: history,
          generationConfig: { maxOutputTokens: tierLimits.outputTokens, temperature: 0.4 },
        });
        assistantText = result?.response?.text?.() || "Okay.";
      }
    }

    // Add assistant turn to session
    await addSessionTurn(sessionId, "assistant", assistantText, provider, model);
    session.turns.push({
      role: "assistant",
      content: assistantText,
      provider,
      model,
      timestamp: new Date().toISOString(),
    });

    // Update session metadata
    await updateSession(sessionId, {
      model_provider: provider,
      model_name: model,
      topic_counts: session.topicCounts
    });

    // Track topics only if tier allows command suggestions
    if (tierLimits.commandSuggestions) {
      trackMessageTopics(session, message);
    }

    // ---- Snapshots (Tier-based limits, every 5 user turns) ----
    const uCount = userTurnCount(session.turns);
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    if (userId && tierLimits.liveNotesPerMonth > 0) {
      const monthlySnapshots = await getUserQuota(userId, 'monthly_snapshots');
      const canCreateSnapshot =
        monthlySnapshots < tierLimits.liveNotesPerMonth &&
        uCount >= 5 &&
        uCount % 5 === 0 &&
        uCount > session.lastSnapshotUserCount;

      if (canCreateSnapshot) {
        const fromTurn = session.lastSnapshotUserCount + 1;
        const toTurn = uCount;

        try {
          const liveNotes = await generateLiveNotes(session.turns, fromTurn, toTurn);

          const snapshotId = `live-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          const entry = {
            id: snapshotId,
            created_at: new Date().toISOString(),
            from_turn: fromTurn,
            to_turn: toTurn,
            key_topics: liveNotes.key_topics || ["General"],
            discussion: liveNotes.discussion || "Ongoing conversation summary",
          };

          await addSessionSnapshot(sessionId, snapshotId, fromTurn, toTurn, entry.key_topics, entry.discussion);
          await updateSession(sessionId, { last_snapshot_user_count: uCount });
          await incrementUserQuota(userId, 'monthly_snapshots');

          session.liveHistory.push(entry);
          session.lastSnapshotUserCount = uCount;

          console.log(`✅ Created snapshot ${snapshotId} for turns ${fromTurn}-${toTurn}. Monthly: ${monthlySnapshots + 1}/${tierLimits.liveNotesPerMonth}`);
        } catch (snapshotError) {
          console.log("❌ Snapshot generation failed:", snapshotError.message);
        }
      }
    }

    // Increment daily message quota after successful processing
    if (userId) {
      await incrementUserQuota(userId, 'daily_messages');
    }

    const latency = Date.now() - startTime;

    // Log the request for observability
    logRequest(userId, sessionId, provider, model, tier, latency, limitHit, error);

    return new Response(
      JSON.stringify({
        text: assistantText,
        inspector: {
          live_history: session.liveHistory || [],
          commands: session.commands || [],
          topicCounts: session.topicCounts || {},
        },
        sessionMeta: {
          isGuest: session.isGuest,
          userId: session.userId,
          tier,
          provider,
          model,
          userTurns: uCount,
          totalTurns: session.turns.length,
          sessionId,
        },
      }),
      {
        status: 200,
        headers: {
          ...PRODUCTION_HEADERS,
          "Content-Type": "application/json; charset=utf-8",
          "X-Session-Id": sessionId,
        },
      }
    );
  } catch (e) {
    error = e?.message || String(e);
    const latency = Date.now() - startTime;

    // Log the error
    logRequest(userId, sessionId, provider, model, tier, latency, limitHit, error);

    console.error("Session error:", e);
    return new Response(JSON.stringify({
      error: `Session error: ${error}`,
      friendly: "An unexpected error occurred. Please try again."
    }), {
      status: 500,
      headers: { ...PRODUCTION_HEADERS, "Content-Type": "application/json" }
    });
  }
}