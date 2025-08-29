// app/components/Chat.jsx
"use client";

import { useEffect, useRef, useState } from "react";

const CHAT_ENDPOINT = "/api/claude"; // ← call the Claude-only endpoint

export default function Chat() {
  const [messages, setMessages] = useState([]); // ← no stubbed welcome message
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Always scroll to the newest message
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    // 1) push user message
    const userMsg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      // 2) call Claude-only endpoint with a minimal payload
      const res = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // IMPORTANT: do not send model/provider/messages; just a single message
        body: JSON.stringify({ message: text }),
      });

      // 3) prepare/update a single assistant bubble as chunks arrive
      let assistantText = "";
      let inserted = false;

      const upsertAssistant = () =>
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (inserted && last?.role === "assistant") {
            const copy = prev.slice(0, -1);
            copy.push({ role: "assistant", content: assistantText });
            return copy;
          }
          inserted = true;
          return [...prev, { role: "assistant", content: assistantText }];
        });

      // Prefer streaming; if not available, fall back to reading the full body
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          assistantText += decoder.decode(value, { stream: true });
          upsertAssistant();
        }
        upsertAssistant(); // flush any buffered tail
      } else if (res.ok) {
        // Non-streaming success
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const data = await res.json().catch(() => ({}));
          assistantText = data?.text || data?.reply || "Okay.";
        } else {
          assistantText = await res.text();
        }
        upsertAssistant();
      } else {
        // Error path: show provider’s actual message when possible
        let errText = "Sorry, the server returned " + res.status + ".";
        try {
          const ct = res.headers.get("content-type") || "";
          if (ct.includes("application/json")) {
            const data = await res.json();
            errText =
              data?.body ||
              data?.error ||
              data?.last_attempt?.body ||
              JSON.stringify(data);
          } else {
            errText = await res.text();
          }
        } catch {}
        setMessages((m) => [...m, { role: "assistant", content: `(error) ${errText}` }]);
        return;
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Sorry, I couldn’t reach ${CHAT_ENDPOINT}.` },
      ]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[1fr_auto] pb-4">
      {/* Messages (only this scrolls) */}
      <div
        ref={scrollRef}
        className="min-h-0 overflow-y-auto px-6 pt-4 pb-3 space-y-4"
      >
        {messages.map((m, i) => {
          const isUser = m.role === "user";
          return (
            <div
              key={i}
              className={`max-w-xl ${isUser ? "brand-user ml-auto" : "brand-agent"}`}
            >
              {m.content}
            </div>
          );
        })}
        {sending && <div className="max-w-xl brand-agent">Thinking…</div>}
      </div>

      {/* Input bar (bottom row) */}
      <form
        onSubmit={handleSubmit}
        className="border-t bg-white/95 backdrop-blur px-4 py-3"
      >
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything… (try: say hi)"
            className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-3 text-slate-800 outline-none focus:ring-2 focus:ring-[#176A82]"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-full px-5 py-3 font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: "#176A82" }}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
