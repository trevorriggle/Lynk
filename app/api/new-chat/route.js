// app/api/new-chat/route.js - New Chat creation API with duplicate prevention

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createSession, getUserTier } from "../../../lib/database.js";

const H = {
  "Access-Control-Allow-Origin": process.env.NODE_ENV === "production"
    ? process.env.FRONTEND_URL || "https://lynk.chat"
    : "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

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
      tier: j.tier || "FREE_VERIFIED"
    };
  } catch {
    return null;
  }
}

// In-memory deduplication for preventing double-clicks
const recentCreationStore = new Map();
const DEDUP_WINDOW_MS = 2000; // 2 seconds

function checkAndMarkCreation(identifier, title) {
  const now = Date.now();
  const key = `${identifier}:${title}`;

  if (recentCreationStore.has(key)) {
    const createdAt = recentCreationStore.get(key);
    if (now - createdAt < DEDUP_WINDOW_MS) {
      return false; // Duplicate within window
    }
  }

  recentCreationStore.set(key, now);

  // Cleanup old entries
  if (Math.random() < 0.1) { // 10% cleanup chance
    for (const [entryKey, timestamp] of recentCreationStore.entries()) {
      if (now - timestamp > DEDUP_WINDOW_MS) {
        recentCreationStore.delete(entryKey);
      }
    }
  }

  return true;
}

function generateChatTitle(message) {
  if (!message || typeof message !== "string") {
    return "New Chat";
  }

  // Clean the message
  const cleaned = message.trim().replace(/\s+/g, " ");

  if (cleaned.length <= 40) {
    return cleaned;
  }

  // Try to find a natural break point
  const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences[0] && sentences[0].trim().length <= 40) {
    return sentences[0].trim();
  }

  // Fall back to truncation at word boundary
  if (cleaned.length > 40) {
    const truncated = cleaned.substring(0, 37);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > 20 ? truncated.substring(0, lastSpace) + "..." : truncated + "...";
  }

  return cleaned;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: H });
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = body?.message?.trim() || "";
    const requestId = body?.requestId || crypto.randomUUID?.() || Math.random().toString(36);

    const userInfo = await getUserFromRequest(req);
    const userId = userInfo?.userId;
    const tier = await getUserTier(userId);

    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const identifier = userId || clientIp;

    // Generate title from message or use default
    const title = message ? generateChatTitle(message) : "New Chat";

    // Check for duplicate creation attempts
    if (!checkAndMarkCreation(identifier, title)) {
      return new Response(JSON.stringify({
        error: "Duplicate request",
        friendly: "Chat already being created. Please wait a moment."
      }), {
        status: 409,
        headers: { ...H, "Content-Type": "application/json" }
      });
    }

    // Create new session
    const sessionId = crypto.randomUUID?.() || "sess_" + Math.random().toString(36).slice(2);
    const session = await createSession(sessionId, userId, tier);

    // Update with title if we have one
    if (title && title !== "New Chat") {
      const { updateSession } = await import("../../../lib/database.js");
      await updateSession(sessionId, { title });
    }

    return new Response(JSON.stringify({
      sessionId: sessionId,
      title: title,
      created: true,
      meta: {
        isGuest: !userId,
        tier: tier,
        userId: userId
      }
    }), {
      status: 200,
      headers: { ...H, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("New chat creation error:", error);
    return new Response(JSON.stringify({
      error: "Failed to create new chat",
      friendly: "Unable to create new chat. Please try again."
    }), {
      status: 500,
      headers: { ...H, "Content-Type": "application/json" }
    });
  }
}