export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { setUserTier, getUserTier, getUserSessions } from "../../../../lib/database.js";

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

// POST - Update user tier (admin only)
export async function POST(req) {
  try {
    const adminUserId = await getUserFromRequest(req);
    if (!adminUserId) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Check if current user is admin (you'll need to set your user ID here)
    const ADMIN_USER_IDS = [
      // Add your Supabase user ID here - find it in Supabase Dashboard > Authentication > Users
      // Example: "12345678-1234-1234-1234-123456789012"
    ];

    if (!ADMIN_USER_IDS.includes(adminUserId)) {
      return new Response("Admin access required", { status: 403 });
    }

    const { userId, tier } = await req.json();

    if (!userId || !tier) {
      return new Response("userId and tier are required", { status: 400 });
    }

    if (!["FREE_GUEST", "FREE_VERIFIED", "PRO"].includes(tier)) {
      return new Response("Invalid tier. Must be FREE_GUEST, FREE_VERIFIED, or PRO", { status: 400 });
    }

    // Update user tier in our database
    await setUserTier(userId, tier);

    // Also update user metadata in Supabase Auth for consistency
    const response = await fetch(`${SUPA_URL}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE,
        'Authorization': `Bearer ${SERVICE}`
      },
      body: JSON.stringify({
        app_metadata: {
          tier: tier
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to update user metadata:", error);
      // Continue anyway since our database is the source of truth
    }

    return Response.json({
      success: true,
      message: `User ${userId} updated to ${tier} tier`
    });

  } catch (error) {
    console.error("Failed to update user tier:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

// GET - List all users (admin only)
export async function GET(req) {
  try {
    const adminUserId = await getUserFromRequest(req);
    if (!adminUserId) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Check if current user is admin
    const ADMIN_USER_IDS = [
      // Add your Supabase user ID here
    ];

    if (!ADMIN_USER_IDS.includes(adminUserId)) {
      return new Response("Admin access required", { status: 403 });
    }

    // Get all users from Supabase Auth
    const response = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
      headers: {
        'apikey': SERVICE,
        'Authorization': `Bearer ${SERVICE}`
      }
    });

    if (!response.ok) {
      return new Response("Failed to fetch users", { status: 500 });
    }

    const data = await response.json();
    const users = data.users || [];

    // Format user data and get their actual tier from our database
    const formattedUsers = await Promise.all(users.map(async (user) => {
      const actualTier = await getUserTier(user.id);
      const sessions = await getUserSessions(user.id, 5); // Get last 5 sessions

      return {
        id: user.id,
        email: user.email,
        tier: actualTier,
        emailConfirmed: !!user.email_confirmed_at,
        createdAt: user.created_at,
        lastSignIn: user.last_sign_in_at,
        sessionCount: sessions.length,
        lastSession: sessions[0]?.updated_at || null
      };
    }));

    return Response.json({ users: formattedUsers });

  } catch (error) {
    console.error("Failed to fetch users:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}