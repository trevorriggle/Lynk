export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { saveSnapshot } from '../../../lib/snapshots';
import { CreateSnapshotData } from '../../../types/snapshot';

// Helper function to get user from request (copied from chat-storage/route.js)
async function getUserFromRequest(req: Request): Promise<string | null> {
  try {
    const cookies = req.headers.get("cookie") || "";
    const cookieObj: Record<string, string> = {};
    cookies.split(/; */).forEach(part => {
      const [key, ...values] = part.split("=");
      if (key && values.length > 0) {
        cookieObj[key.trim()] = decodeURIComponent(values.join("="));
      }
    });

    const access_token = cookieObj["sb-access-token"];
    if (!access_token) return null;

    const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const userResponse = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: {
        apikey: SERVICE!,
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

// POST - Save a snapshot
export async function POST(req: Request) {
  try {
    const userId = await getUserFromRequest(req);
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { session_id, turn_index, summary_text, message_ids, model } = body;

    // Validate required fields
    if (!session_id || typeof turn_index !== 'number' || !summary_text || !Array.isArray(message_ids) || !model) {
      return new Response("Missing required fields", { status: 400 });
    }

    const snapshotData: CreateSnapshotData = {
      user_id: userId,
      session_id,
      turn_index,
      summary_text,
      message_ids,
      model,
    };

    const success = await saveSnapshot(snapshotData);

    if (!success) {
      return new Response("Failed to save snapshot", { status: 500 });
    }

    return Response.json({ success: true });

  } catch (error) {
    console.error("Failed to save snapshot:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}