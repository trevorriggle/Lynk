// app/api/chat/route.js - ANTHROPIC DEBUG
export const runtime = "nodejs";

function coerceMessages(body) {
  if (Array.isArray(body?.messages) && body.messages.length) {
    return body.messages.map((m) => ({
      role: m?.role === "assistant" ? "assistant" : "user",
      content: [{ type: "text", text: String(m?.content ?? "") }],
    }));
  }
  return [];
}

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
      // Debug Claude path specifically
      const messages = coerceMessages(body);
      const apiKey = process.env.ANTHROPIC_API_KEY;
      
      const requestBody = {
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 1024,
        temperature: 0.4,
        messages,
      };

      let debugInfo = {
        step: "PREPARING_CLAUDE_REQUEST",
        hasApiKey: !!apiKey,
        apiKeyPreview: apiKey ? apiKey.substring(0, 10) + "..." : null,
        requestBody: requestBody,
        messagesLength: messages.length
      };

      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(requestBody),
        });

        const responseText = await res.text();
        
        debugInfo.step = "RECEIVED_CLAUDE_RESPONSE";
        debugInfo.status = res.status;
        debugInfo.ok = res.ok;
        debugInfo.responseHeaders = Object.fromEntries(res.headers.entries());
        debugInfo.responseBody = responseText;

        if (!res.ok) {
          debugInfo.step = "CLAUDE_API_ERROR";
        } else {
          try {
            const parsed = JSON.parse(responseText);
            debugInfo.parsedResponse = parsed;
            debugInfo.step = "SUCCESS";
          } catch (parseErr) {
            debugInfo.step = "JSON_PARSE_ERROR";
            debugInfo.parseError = parseErr.message;
          }
        }

      } catch (fetchErr) {
        debugInfo.step = "FETCH_ERROR";
        debugInfo.fetchError = fetchErr.message;
        debugInfo.stack = fetchErr.stack;
      }

      return new Response(JSON.stringify(debugInfo, null, 2), {
        headers: { "Content-Type": "application/json" },
      });

    } else {
      // OpenAI path (simplified, just to keep it working)
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
    return new Response(`Route error: ${err.message}\n${err.stack}`, { status: 500 });
  }
}