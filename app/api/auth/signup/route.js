// app/api/auth/signup/route.js
export const runtime = "nodejs";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

    // Supabase REST signup
    const r = await fetch(`${SUPA_URL}/auth/v1/signup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
      },
      body: JSON.stringify({
        email,
        password,
        data: { plan: "free" },
      }),
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
        error: data?.error?.message || data?.message || data?._raw || `HTTP ${r.status}` 
      }), {
        status: r.status,
        headers: { "content-type": "application/json" },
      });
    }

    // If email confirmations are enabled, session=null and user is returned
    const needs_confirmation = !data?.session;
    return new Response(JSON.stringify({ 
      ok: true, 
      needs_confirmation, 
      user: data?.user ?? null 
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ 
      error: e?.message || "Unexpected error" 
    }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export async function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}