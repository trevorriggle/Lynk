// app/api/chat/route.js
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Issue or reuse a session cookie so we can persist history later
function getOrSetSid() {
  const jar = cookies();
  let sid = jar.get("sid")?.value;
  if (!sid) {
    sid = crypto.randomUUID();
    jar.set("sid", sid, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }
  return sid;
}

export async function POST(req) {
  const sid = getOrSetSid();
  let reply = "Okay.";

  try {
    const { messages = [], model = "gpt-4o-mini", temperature = 0.4 } = await req.json();

    if (process.env.OPENAI_API_KEY) {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: messages.map(({ role, content }) => ({ role, content })),
          temperature,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        reply = data?.choices?.[0]?.message?.content ?? reply;
      } else {
        const errText = await resp.text();
        console.error("OpenAI error:", resp.status, errText);
        reply = `Sorry, the model API returned ${resp.status}.`;
      }
    } else {
      // Fallback stub so your UI still works
      const last = messages[messages.length - 1]?.content ?? "";
      reply = `You said: ${last}`;
    }
  } catch (err) {
    console.error("POST /api/chat error:", err);
    reply = "Sorry, something went wrong on the server.";
  }

  return NextResponse.json({ reply, sid });
}
