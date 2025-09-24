// app/api/admin/user-sessions/route.js - View user sessions, snapshots, and suggestions

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getUserSessions, getSession } from "../../../../lib/database.js";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Helper function to get user from request
async function getUserFromRequest(req) {
  try {
    const cookies = req.headers.get("cookie") || "";
    const cookieObj = {};
    cookies.split(/; */).forEach(part => {
      const [key, ...values] = part.split("=");
      if (key && values.length > 0) {
        cookieObj[key.trim()] = decodeURIComponent(values.join("="));
      }
    });

    const access_token = cookieObj["sb-access-token"];
    if (!access_token) return null;

    const userResponse = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${access_token}`
      },
    });

    if (!userResponse.ok) return null;
    const user = await userResponse.json();
    return user?.id || null;
  } catch (error) {
    console.error("Auth error:", error);
    return null;
  }
}

// GET - Get user sessions and details (admin only)
export async function GET(req) {
  try {
    const adminUserId = await getUserFromRequest(req);
    if (!adminUserId) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Check if current user is admin
    const ADMIN_USER_IDS = [
      // Add your Supabase user ID here - same as in update-user-tier/route.js
    ];

    if (!ADMIN_USER_IDS.includes(adminUserId)) {
      return new Response("Admin access required", { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const sessionId = searchParams.get("sessionId");

    if (!userId) {
      return new Response("userId is required", { status: 400 });
    }

    if (sessionId) {
      // Get specific session details
      const session = await getSession(sessionId, userId);
      if (!session) {
        return new Response("Session not found", { status: 404 });
      }

      return Response.json({
        session: {
          id: session.id,
          userId: session.userId,
          title: session.title,
          tier: session.tier,
          isGuest: session.isGuest,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          turnsCount: session.turns.length,
          turns: session.turns.map(turn => ({
            role: turn.role,
            content: turn.content.substring(0, 200) + (turn.content.length > 200 ? "..." : ""),
            provider: turn.provider,
            model: turn.model,
            timestamp: turn.timestamp
          })),
          snapshots: session.liveHistory,
          commands: session.commands,
          topicCounts: session.topicCounts
        }
      });
    } else {
      // Get user's sessions list
      const sessions = await getUserSessions(userId, 50);

      return Response.json({
        userId,
        sessions: sessions.map(session => ({
          sessionId: session.session_id,
          title: session.title,
          modelProvider: session.model_provider,
          modelName: session.model_name,
          createdAt: session.created_at,
          updatedAt: session.updated_at
        }))
      });
    }

  } catch (error) {
    console.error("Failed to fetch user sessions:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}