export const runtime = "nodejs";

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const modelLabel = String(body?.model ?? "").trim();
    
    const wantsClaude = modelLabel.toLowerCase() === "claude";
    
    const debug = {
      receivedModel: modelLabel,
      wantsClaude: wantsClaude,
      willGoTo: wantsClaude ? "ANTHROPIC" : "OPENAI",
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
      messages: body.messages || []
    };

    return new Response(JSON.stringify(debug, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
    
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}