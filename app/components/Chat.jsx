// app/components/Chat.jsx
"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Chat
 * - Agent (left) bubble: bg-lynk-agent (#C7EBEA)
 * - You  (right) bubble: bg-lynk-user  (#D9D9D9)
 * - Sticky input bar with Send button (restored)
 */
export default function Chat({ model = "Gemini 1.5 Pro" }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Welcome to Lynk. Continue, discuss new ideas, or do anything else.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    // Show user's message immediately
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      // Call your existing API route; adjust payload/response as needed
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: text, messages: next }),
      });

      let reply = "Okay.";
      if (res.ok) {
        const data = await res.json();
        reply = data.reply ?? data.message ?? data.content ?? data.text ?? "Okay.";
      } else {
        reply = `Sorry, the server returned ${res.status}.`;
      }

      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Sorry, I couldn’t reach /api/chat." },
      ]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex h-full min-h-[60vh] flex-col">
      {/* Messages list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-6 space-y-4"
      >
        {messages.map((m, i) => {
          const isUser = m.role === "user";
          return (
            <div
              key={i}
              className={`max-w-xl rounded-2xl px-4 py-3 shadow-soft ${
                isUser
                  ? "ml-auto bg-lynk-user text-lynk-ink"
                  : "bg-lynk-agent text-lynk-ink"
              }`}
            >
              {m.content}
            </div>
          );
        })}

        {sending && (
          <div className="max-w-xl rounded-2xl bg-lynk-agent text-lynk-ink px-4 py-3 shadow-soft">
            Thinking…
          </div>
        )}
      </div>

      {/* Input bar (sticky at bottom) */}
      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 border-t border-lynk-panelBubble bg-lynk-bg/95 backdrop-blur px-4 py-3"
      >
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything… (try: flinn?)"
            className="flex-1 rounded-full border border-lynk-panelBubble bg-white px-4 py-3 text-lynk-ink outline-none focus:ring-2 focus:ring-lynk-panelBubble"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-full bg-lynk-panelBubble px-5 py-3 font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
