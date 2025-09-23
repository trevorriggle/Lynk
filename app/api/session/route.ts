// app/api/session/route.ts — auth-only snapshots, delta trigger, high-signal notes, vision support

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
function buildIdentitySystemPrompt({ appName, provider, modelName }: { appName: string; provider: string; modelName: string }) {
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

// ---------- Vision Processing ----------
async function processImageWithVision(imageDataURL: string, message: string, provider: string, modelName: string) {
  try {
    if (provider === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return "I can see you've shared an image, but OpenAI vision isn't configured.";

      const client = new OpenAI({ apiKey: key });

      // Use vision-capable model
      const visionModel = modelName === "gpt-4o" ? "gpt-4o" : "gpt-4o";

      const response = await client.chat.completions.create({
        model: visionModel,
        max_tokens: OUTPUT_TOKENS,
        temperature: 0.4,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: message || "What do you see in this image? Please describe it in detail."
              },
              {
                type: "image_url",
                image_url: {
                  url: imageDataURL
                }
              }
            ]
          }
        ]
      });

      return response?.choices?.[0]?.message?.content || "I can see the image but couldn't generate a response.";

    } else if (provider === "anthropic") {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return "I can see you've shared an image, but Claude vision isn't configured.";

      // Extract base64 data from data URL
      const base64Match = imageDataURL.match(/^data:image\/[^;]+;base64,(.+)$/);
      if (!base64Match) return "Invalid image format for Claude vision.";

      const base64Data = base64Match[1];
      const mediaType = imageDataURL.match(/^data:(image\/[^;]+)/)?.[1] || "image/png";

      const payload = {
        model: "claude-3-sonnet-20240229", // Use vision-capable model
        max_tokens: OUTPUT_TOKENS,
        temperature: 0.4,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64Data
                }
              },
              {
                type: "text",
                text: message || "What do you see in this image? Please describe it in detail."
              }
            ]
          }
        ]
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
        return (data?.content || [])
          .filter((b: any) => b?.type === "text")
          .map((b: any) => b.text)
          .join("") || "I can see the image but couldn't generate a response.";
      } catch {
        return txt || "I can see the image but couldn't generate a response.";
      }

    } else if (provider === "gemini") {
      const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!key) return "I can see you've shared an image, but Gemini vision isn't configured.";

      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      // Convert data URL to the format Gemini expects
      const base64Match = imageDataURL.match(/^data:image\/[^;]+;base64,(.+)$/);
      if (!base64Match) return "Invalid image format for Gemini vision.";

      const base64Data = base64Match[1];
      const mimeType = imageDataURL.match(/^data:(image\/[^;]+)/)?.[1] || "image/png";

      const imagePart = {
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      };

      const textPart = message || "What do you see in this image? Please describe it in detail.";

      const result = await model.generateContent([textPart, imagePart]);
      return result?.response?.text?.() || "I can see the image but couldn't generate a response.";

    } else {
      return `I can see you've shared an image, but vision analysis isn't currently supported with ${provider}. Please switch to OpenAI, Claude, or Gemini to analyze images.`;
    }
  } catch (error) {
    console.error("Vision processing error:", error);
    return "I can see the image but encountered an error analyzing it.";
  }
}

// ---------- Session store ----------
interface Turn {
  role: "user" | "assistant";
  content: string;
  provider: string;
  model: string;
  timestamp: string;
  id?: string;
}

interface Session {
  id: string;
  turns: Turn[];
  last: { provider: string; model: string };
  liveHistory: any[];
  topicCounts: Record<string, number>;
  commands: any[];
  userId: string | null;
  isGuest: boolean;
  createdAt: string;
  _lastSnapshotUserCount: number;
}

const SESSIONS = new Map<string, Session>();
const estTokens = (s: string) => Math.ceil((s || "").length / 3.8);

function getSessionKey(sessionId: string, userId: string | null = null) {
  return userId ? `auth:${userId}:${sessionId}` : `guest:${sessionId}`;
}

function getSession(sessionId: string, userId: string | null = null): Session {
  const key = getSessionKey(sessionId, userId);
  if (!SESSIONS.has(key)) {
    SESSIONS.set(key, {
      id: sessionId,
      turns: [],
      last: { provider: "", model: "" },
      liveHistory: [],
      topicCounts: {},
      commands: [],
      userId,
      isGuest: !userId,
      createdAt: new Date().toISOString(),
      _lastSnapshotUserCount: 0,
    });
  }
  return SESSIONS.get(key)!;
}

function cleanupGuestSession(sessionId: string) {
  const guestKey = getSessionKey(sessionId, null);
  if (SESSIONS.has(guestKey)) SESSIONS.delete(guestKey);
}

async function getUserFromRequest(req: Request): Promise<string | null> {
  try {
    const cookies = req.headers.get("cookie");
    if (!cookies) return null;
    const { origin } = new URL(req.url);
    const base = process.env.NEXTAUTH_URL || origin;
    const r = await fetch(`${base}/api/me`, {
      headers: { cookie: cookies },
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.userId || null;
  } catch {
    return null;
  }
}

const asText = (x: any) => (typeof x === "string" ? x : String(x ?? ""));

// ---------- Prompt guards ----------
function shouldInjectIdentity(message: string) {
  const triggers = [
    /(^|\b)(who are you|what (are you|model)|what ai|what is lynk|which model|are you (openai|claude|gemini))(\b)/i,
  ];
  return triggers.some((re) => re.test(message || ""));
}

// ---------- Message shaping ----------
function buildBudgetedTurns(turns: Turn[], maxTokens: number) {
  const out: Turn[] = [];
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

const userTurnCount = (turns: Turn[]) =>
  turns.reduce((n, t) => (t.role === "user" ? n + 1 : n), 0);

function buildOpenAIMessages(turns: Turn[]) {
  return buildBudgetedTurns(turns, INPUT_TOKEN_BUDGET).map((t) => ({
    role: t.role === "assistant" ? "assistant" : "user",
    content: t.content,
  }));
}
function buildAnthropicMessages(turns: Turn[]) {
  return buildBudgetedTurns(turns, INPUT_TOKEN_BUDGET).map((t) => ({
    role: t.role === "assistant" ? "assistant" : "user",
    content: [{ type: "text", text: t.content }],
  }));
}
function buildGeminiHistory(turns: Turn[]) {
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
}: {
  baseURL: string;
  key: string;
  model: string;
  messages: any[];
  max_tokens?: number;
  temperature?: number;
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

function extractJson(s: string) {
  const str = (s || "").trim();
  const start = str.indexOf("{");
  const end = str.lastIndexOf("}");
  if (start >= 0 && end > start) return str.slice(start, end + 1);
  return "{}";
}

function runWithTimeout(p: Promise<any>, ms = 4500, label = "task") {
  let id: NodeJS.Timeout;
  const guard = new Promise((_, rej) => {
    id = setTimeout(() => rej(new Error(`Timeout: ${label}`)), ms);
  });
  return Promise.race([p.finally(() => clearTimeout(id)), guard]);
}

// ---------- Commands/Suggestions ----------
function trackMessageTopics(session: Session, message: string) {
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

// ---------- Enhanced Live Notes Generation ----------
async function generateLiveNotes(turns: Turn[], fromTurn: number, toTurn: number) {
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

function createDetailedFallbackNotes(turns: Turn[]) {
  const recent = turns.slice(-16);
  const userMsgs = recent.filter((t) => t.role === "user").map((t) => t.content || "");
  const asstMsgs = recent.filter((t) => t.role === "assistant").map((t) => t.content || "");
  const allContent = [...userMsgs, ...asstMsgs].join(" ").replace(/\s+/g, " ").trim();

  const lc = allContent.toLowerCase();

  // Enhanced topic detection
  const topics: string[] = [];
  if (/\b(ui|ux|design|layout|typography|component|grid|style|visual|interface)\b/.test(lc)) topics.push("Design");
  if (/\b(code|javascript|python|react|api|function|programming|development|software|debug)\b/.test(lc)) topics.push("Programming");
  if (/\b(data|metric|chart|dashboard|analytics|sql|database|visualization)\b/.test(lc)) topics.push("Data");
  if (/\b(market|pricing|sales|cost|roi|plan|timeline|business|strategy|revenue)\b/.test(lc)) topics.push("Business");
  if (/\b(model|ai|gpt|claude|gemini|token|embedding|machine learning|neural)\b/.test(lc)) topics.push("AI");
  if (/\b(user|customer|feedback|experience|testing|research|interview)\b/.test(lc)) topics.push("User Research");
  if (/\b(project|management|agile|scrum|sprint|delivery|roadmap)\b/.test(lc)) topics.push("Project Management");
  if (/\b(fruit|food|nutrition|health|vitamin|recipe|cooking|diet)\b/.test(lc)) topics.push("Food & Nutrition");
  if (/\b(exercise|fitness|workout|training|health|wellness)\b/.test(lc)) topics.push("Health & Fitness");
  if (/\b(education|learning|study|knowledge|teach|explain)\b/.test(lc)) topics.push("Education");

  // Extract specific entities mentioned
  const entities: string[] = [];
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

  // Create detailed discussion summary
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

// ---------- Snapshot persistence helper ----------
async function persistSnapshot(
  sessionId: string,
  turnIndex: number,
  summaryText: string,
  messageIds: string[],
  model: string
): Promise<boolean> {
  try {
    const { origin } = new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000');
    const response = await fetch(`${origin}/api/chat-storage/snapshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        turn_index: turnIndex,
        summary_text: summaryText,
        message_ids: messageIds,
        model: model,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to persist snapshot:', error);
    return false;
  }
}

// ---------- Routes ----------
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: H });
}

export async function GET(req: Request) {
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

export async function POST(req: Request) {
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

    // Check if message has image attachments
    const attachments = body?.attachments || [];
    const hasImageAttachment = attachments.some((att: any) => att.type === "image");

    const needsIdentity = shouldInjectIdentity(message);
    const systemIdentity = needsIdentity
      ? buildIdentitySystemPrompt({ appName: APP_NAME, provider, modelName })
      : null;

    const s = getSession(sessionId, userId);
    const userTurnId = crypto.randomUUID?.() || `turn_${Date.now()}`;
    s.turns.push({
      id: userTurnId,
      role: "user",
      content: message,
      provider,
      model: modelName,
      timestamp: new Date().toISOString(),
    });

    // ---- Handle vision processing or regular provider calls ----
    let assistantText = "";

    if (hasImageAttachment) {
      // Use vision processing with the current provider
      const imageAttachment = attachments.find((att: any) => att.type === "image");
      assistantText = await processImageWithVision(imageAttachment.data, message, provider, modelName);
    } else {
      // Regular text-only processing
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
              .filter((b: any) => b?.type === "text")
              .map((b: any) => b.text)
              .join("") || "Okay.";
        } catch {
          assistantText = txt || "Okay.";
        }
      } else {
        const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        if (!key) return new Response("GEMINI_API_KEY missing", { status: 500, headers: H });
        const genAI = new GoogleGenerativeAI(key);
        const cfg: any = { model: modelName || "gemini-1.5-flash" };
        if (needsIdentity) cfg.systemInstruction = systemIdentity;
        const model = genAI.getGenerativeModel(cfg);
        const history = buildGeminiHistory(s.turns);
        const result = await model.generateContent({
          contents: history,
          generationConfig: { maxOutputTokens: OUTPUT_TOKENS, temperature: 0.4 },
        });
        assistantText = result?.response?.text?.() || "Okay.";
      }
    }

    const assistantTurnId = crypto.randomUUID?.() || `turn_${Date.now()}`;
    s.turns.push({
      id: assistantTurnId,
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
      uCount >= 5 &&
      uCount % 5 === 0 &&
      uCount > (s._lastSnapshotUserCount || 0);

    if (shouldCreateSnapshot) {
      const fromTurn = (s._lastSnapshotUserCount || 0) + 1;
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
        s.liveHistory.push(entry); // This ADDS to the array, doesn't replace
        s._lastSnapshotUserCount = uCount;

        // ---- PERSIST SNAPSHOT TO SUPABASE ----
        const summaryText = `Topics: ${(liveNotes.key_topics || []).join(", ")}. ${liveNotes.discussion || ""}`;
        const relevantMessageIds = s.turns
          .slice(-10) // Last 10 turns
          .filter(turn => turn.id)
          .map(turn => turn.id!);

        const persistSuccess = await persistSnapshot(
          sessionId,
          uCount,
          summaryText,
          relevantMessageIds,
          `${provider}:${modelName}`
        );

        console.log(`✅ Created snapshot ${entry.id} for turns ${fromTurn}-${toTurn}. Total snapshots: ${s.liveHistory.length}. Persisted: ${persistSuccess}`);
      } catch (error) {
        console.log("❌ Snapshot generation failed:", error);
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
  } catch (e: any) {
    return new Response(`Session error: ${e?.message || String(e)}`, {
      status: 500,
      headers: H,
    });
  }
}