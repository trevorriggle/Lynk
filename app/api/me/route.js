export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Improved cookie parser
function parseCookie(cookieHeader = "") {
  const cookies = {};
  cookieHeader.split(/; */).forEach(part => {
    const [key, ...values] = part.split("=");
    if (!key || values.length === 0) return;
    cookies[key.trim()] = decodeURIComponent(values.join("="));
  });
  return cookies;
}

export async function GET(req) {
  try {
    // 1) Read auth cookies set by /api/auth/finish
    const cookies = parseCookie(req.headers.get("cookie") || "");
    const access_token = cookies["sb-access-token"];
    
    if (!access_token) {
      return new Response("unauthorized", { status: 401 });
    }

    // 2) Verify the token with Supabase and get user info
    const userResponse = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { 
        apikey: SERVICE, 
        Authorization: `Bearer ${access_token}` 
      },
    });
    
    if (!userResponse.ok) {
      return new Response("unauthorized", { status: 401 });
    }
    
    const user = await userResponse.json();
    const userId = user?.id;
    const userEmail = user?.email;

    if (!userId) {
      return new Response("unauthorized", { status: 401 });
    }

    // 3) Get user's project info
    const projectResponse = await fetch(
      `${SUPA_URL}/rest/v1/projects?user_id=eq.${userId}&select=id,name&order=created_at.asc&limit=1`,
      { 
        headers: { 
          apikey: SERVICE, 
          Authorization: `Bearer ${SERVICE}` 
        } 
      }
    );
    
    const projects = projectResponse.ok ? await projectResponse.json() : [];
    const project = projects?.[0] || null;

    // 4) Determine user tier (can be enhanced with database lookup later)
    const userTier = userId ? "FREE_VERIFIED" : "FREE_GUEST"; // Default authenticated users to FREE_VERIFIED

    return Response.json({
      ok: true,
      userId,
      tier: userTier,
      projectId: project?.id || null,
      project: {
        ...project,
        email: userEmail
      }
    });
  } catch (e) {
    console.error("Me endpoint error:", e);
    return new Response(`me error: ${e.message}`, { status: 500 });
  }
}