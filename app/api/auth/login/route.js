export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function setCookieHeaders({ access_token, refresh_token, maxAgeSec = 60 * 60 * 24 * 7 }) {
  const base = `Path=/; SameSite=Lax; Secure; HttpOnly; Max-Age=${maxAgeSec}`;
  return [
    `sb-access-token=${access_token}; ${base}`,
    `sb-refresh-token=${refresh_token}; ${base}`
  ];
}

export async function POST(req) {
  if (!SUPA_URL || !ANON) {
    return new Response(JSON.stringify({ error: "Supabase env vars missing" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Missing email/password" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Password grant to Supabase
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
      },
      body: JSON.stringify({ email, password }),
    });

    const text = await r.text().catch(() => "");
    let data = {};
    try { 
      data = text ? JSON.parse(text) : {}; 
    } catch { 
      data = { _raw: text }; 
    }

    if (!r.ok) {
      return new Response(JSON.stringify({ 
        error: data?.error_description || data?.error || data?.message || data?._raw || `HTTP ${r.status}` 
      }), {
        status: r.status,
        headers: { "content-type": "application/json" },
      });
    }

    // Extract tokens from successful login
    const access_token = data?.access_token;
    const refresh_token = data?.refresh_token;
    const user = data?.user;

    if (!access_token || !user) {
      return new Response(JSON.stringify({ error: "Invalid login response" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    // Set httpOnly cookies for session
    const headers = new Headers({ "content-type": "application/json" });
    if (access_token && refresh_token) {
      const cookies = setCookieHeaders({ access_token, refresh_token });
      headers.append("Set-Cookie", cookies[0]);
      headers.append("Set-Cookie", cookies[1]);
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      user: { id: user.id, email: user.email }
    }), { 
      status: 200, 
      headers 
    });

  } catch (e) {
    console.error("Login error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unexpected error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export async function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}