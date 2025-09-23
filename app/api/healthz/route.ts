// app/api/healthz/route.ts
export async function GET() {
  return Response.json({
    ok: true,
    ts: true,
    timestamp: new Date().toISOString(),
    node: process.version
  });
}