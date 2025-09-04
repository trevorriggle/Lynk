export const runtime = "nodejs";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY;

// tiny cookie parser
function parseCookie(h = "") {
  const m = {};
  h.split(/; */).forEach(p => {
    const [k, ...v] = p.split("=");
    if (!k || !v) return;
    m[k.trim()] = decodeURIComponent(v.join("="));
  });
  return m;
}

export async function GET(req) {
  try {
    // 1) read auth cookie set by /api/auth/finish
    const cookies = parseCookie(req.headers.get("cookie") || "");
    const access_token = cookies["sb-access-token"];
    if (!access_token) return new Response("unauthorized", { status: 401 });

    // 2) who am I?
    const u = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE, Authorization: `Bearer ${access_token}` },
    });
    if (!u.ok) return new Response("unauthorized", { status: 401 });
    const user = await u.json();
    const userId = user?.id;

    // 3) get (first) project for this user
    const pr = await fetch(
      `${SUPA_URL}/rest/v1/projects?user_id=eq.${userId}&select=id,name&order=created_at.asc&limit=1`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }
    );
    const rows = pr.ok ? await pr.json() : [];
    const project = rows?.[0] || null;

    return Response.json({ ok: true, userId, projectId: project?.id || null, project });
  } catch (e) {
    return new Response(`me error: ${e.message}`, { status: 500 });
  }
}
