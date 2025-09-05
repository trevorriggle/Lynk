export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // Clear authentication cookies by setting them to expire immediately
    const headers = new Headers({ "content-type": "application/json" });
    
    // Set cookies with Max-Age=0 to delete them
    const clearCookies = [
      "sb-access-token=; Path=/; SameSite=Lax; Secure; HttpOnly; Max-Age=0",
      "sb-refresh-token=; Path=/; SameSite=Lax; Secure; HttpOnly; Max-Age=0"
    ];
    
    headers.append("Set-Cookie", clearCookies[0]);
    headers.append("Set-Cookie", clearCookies[1]);

    return new Response(JSON.stringify({ ok: true, message: "Logged out successfully" }), {
      status: 200,
      headers
    });
  } catch (e) {
    console.error("Logout error:", e);
    return new Response(JSON.stringify({ error: "Logout failed" }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}

export async function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}