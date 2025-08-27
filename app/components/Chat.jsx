// app/components/Chat.jsx
"use client";

import { useEffect, useRef, useState } from "react";

export default function Chat({ model = "Gemini 1.5 Pro" }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Welcome to Lynk. Continue, discuss new ideas, or do anything else." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: next, temperature: 0.4 }),
      });
      let reply = "Okay.";
      if (res.ok) {
        const data = await res.json();
        reply = data.reply ?? "Okay.";
      } else {
        reply = `Sorry, the server returned ${res.status}.`;
      }
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Sorry, I couldn’t reach /api/chat." }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Messages (only this scrolls) */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-6 pt-0 pb-24 space-y-4"
      >
        {messages.map((m, i) => {
          const isUser = m.role === "user";
          return (
            <div key={i} className={`max-w-xl ${isUser ? "brand-user ml-auto" : "brand-agent"}`}>
              {m.content}
            </div>
          );
        })}
        {sending && <div className="max-w-xl brand-agent">Thinking…</div>}
      </div>

      {/* Input locked to bottom */}
      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 inset-x-0 border-t bg-white/95 backdrop-blur px-4 py-3"
      >
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything… (try: flinn?)"
            className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-3 text-slate-800 outline-none focus:ring-2 focus:ring-brand-teal"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-full bg-brand-teal px-5 py-3 font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
