// app/api/chat/route.js - TEST MODEL VERSIONS
export const runtime = "nodejs";

function coerceMessagesForOpenAI(body) {
  if (Array.isArray(body?.messages) && body.messages.length) {
    return body.messages.map((m) => ({
      role: m?.role || "user",
      content: typeof m?.content === "string" ? m.content : String(m?.content ?? ""),
    }));
  }
  return [];
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const modelLabel = String(body?.model ?? "").trim();
    const wantsClaude = modelLabel.toLowerCase() === "claude";

    if (wantsClaude) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      
      // Try different model versions to find one that works
      const modelsToTry = [
        "claude-3-5-sonnet-20241022",
        "claude-3-5-sonnet-latest", 
        "claude-3-5-sonnet-20240620",
        "claude-3-sonnet-20240229",
        "claude-3-haiku-20240307"
      ];

      let results = { attempts: [] };

      for (const model of modelsToTry) {
        try {
          const testRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: model,
              max_tokens: 50,
              messages: [{ role: "user", content: [{ type: "text", text: "test" }] }],
            }),
          });

          const responseText = await testRes.text();
          results.attempts.push({
            model: model,
            status: testRes.status,
            ok: testRes.ok,
            response: testRes.ok ? "SUCCESS" : responseText
          });

          if (testRes.ok) {
            results.workingModel = model;
            break;
          }
        } catch (err) {
          results.attempts.push({
            model: model,
            error: err.message
          });
        }
      }

      return new Response(JSON.stringify(results, null, 2), {
        headers: { "Content-Type": "application/json" },
      });

    } else {
      // OpenAI path (keep working)
      const messages = coerceMessagesForOpenAI(body);
      const openaiKey = process.env.OPENAI_API_KEY;

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
          temperature: 0.4,
          stream: false,
        }),
      });

      if (!res.ok) {
        return new Response(`OpenAI error: ${res.status}`, { status: 500 });
      }

      const data = await res.json();
      const reply = data?.choices?.[0]?.message?.content || "No response";
      return new Response(reply, { headers: { "Content-Type": "text/plain" } });
    }

  } catch (err) {
    return new Response(`Route error: ${err.message}`, { status: 500 });
  }
}