export const runtime = "nodejs";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

function setCookieHeaders({ access_token, refresh_token, maxAgeSec = 60 * 60 * 24 * 7 }) {
  const base = `Path=/; SameSite=Lax; Secure; HttpOnly; Max-Age=${maxAgeSec}`;
  return [
    `sb-access-token=${access_token}; ${base}`,
    `sb-refresh-token=${refresh_token}; ${base}`
  ];
}

async function supaGET(path, headers = {}) {
  const r = await fetch(`${SUPA_URL}${path}`, { headers });
  if (!r.ok) throw new Error(await r.text().catch(() => String(r.status)));
  return r.json();
}

async function supaUpsert(table, row, onConflictCol) {
  const params = onConflictCol ? `?on_conflict=${onConflictCol}` : "";
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}${params}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(await r.text().catch(() => String(r.status)));
}

export async function POST(req) {
  try {
    const { access_token, refresh_token } = await req.json();
    if (!access_token) {
      return new Response(JSON.stringify({ error: "no token" }), { 
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    // 1) Lookup user via auth
    const user = await supaGET(`/auth/v1/user`, {
      apikey: SERVICE,
      Authorization: `Bearer ${access_token}`,
    });
    const userId = user?.id;
    const email = user?.email || null;
    
    if (!userId) {
      return new Response(JSON.stringify({ error: "bad token" }), { 
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }

    // 2) Ensure profile
    await supaUpsert("profiles", { id: userId, email }, "id");

    // 3) Ensure default project
    const pr = await supaGET(
      `/rest/v1/projects?user_id=eq.${userId}&select=id&limit=1`,
      { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }
    );
    if (!Array.isArray(pr) || pr.length === 0) {
      await fetch(`${SUPA_URL}/rest/v1/projects`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: SERVICE,
          Authorization: `Bearer ${SERVICE}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ user_id: userId, name: "My First Project" }),
      });
    }

    // 4) Set httpOnly cookies for session - THIS IS THE KEY FIX
    const headers = new Headers({ "content-type": "application/json" });
    if (access_token && refresh_token) {
      const cookies = setCookieHeaders({ access_token, refresh_token });
      headers.append("Set-Cookie", cookies[0]);
      headers.append("Set-Cookie", cookies[1]);
    }

    return new Response(JSON.stringify({ ok: true, userId, email }), { 
      status: 200, 
      headers 
    });
  } catch (e) {
    console.error("Auth finish error:", e);
    return new Response(JSON.stringify({ error: `finish error: ${e.message}` }), { 
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}