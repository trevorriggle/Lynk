export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mask = (v) => (v ? v.slice(0,4) + "…" + v.slice(-4) : null);

export async function GET() {
  return Response.json({
    vercel_env: process.env.VERCEL_ENV || null,      // "production" | "preview" | "development"
    region: process.env.VERCEL_REGION || "unknown",
    ANTHROPIC_API_KEY_present: !!process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_API_KEY_preview: mask(process.env.ANTHROPIC_API_KEY || ""),
  }, { headers: { "Cache-Control": "no-store" }});
}
