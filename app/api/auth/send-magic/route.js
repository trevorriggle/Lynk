export const runtime = "nodejs";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Adjust to your domain
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || ""; // optional convenience
const REDIRECT_TO = `${BASE_URL || ""}/auth/callback`;

export async function POST(req) {
  try {
    const { email } = await req.json();
    if (!email) return new Response("Missing email", { status: 400 });

    const r = await fetch(`${SUPA_URL}/auth/v1/otp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
      },
      body: JSON.stringify({
        email,
        type: "magiclink",
        options: { emailRedirectTo: REDIRECT_TO },
      }),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return new Response(`Send OTP failed: ${t}`, { status: 500 });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(`Error: ${e.message || "unknown"}`, { status: 500 });
  }
}
