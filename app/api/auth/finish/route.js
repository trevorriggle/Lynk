export const runtime = "nodejs";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// REST helpers
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
    const { access_token } = await req.json();
    if (!access_token) return new Response("no token", { status: 400 });

    // 1) Get the user info from Supabase Auth
    const user = await supaGET(`/auth/v1/user`, {
      apikey: SERVICE,                 // we can call with service
      Authorization: `Bearer ${access_token}`,
    });

    const userId = user?.id;
    const email = user?.email || null;
    if (!userId) return new Response("bad token", { status: 401 });

    // 2) Upsert profile (id matches auth.users.id)
    await supaUpsert("profiles", { id: userId, email }, "id");

    // 3) Ensure a default project exists
    // check if any project exists for this user
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

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(`finish error: ${e.message}`, { status: 500 });
  }
}
