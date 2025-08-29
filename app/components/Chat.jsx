// app/components/Chat.jsx
"use client";

import { useEffect, useRef, useState } from "react";

export default function Chat({ selectedModel }) {
  // Pull the endpoint/label from the pill; default keeps Claude working
  const endpoint = selectedModel?.endpoint || "/api/claude";
  const label = selectedModel?.label || "Claude";

  const [messages, setMessages] = useState([]); // start empty so only real replies show
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
      // 2) call the selected endpoint with a minimal payload
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      // 3) create/update one assistant bubble
      let assistantText = "";
      let inserted = false;
      const upsert = () =>
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

      // Prefer streaming if available; else fallback to once
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          assistantText += decoder.decode(value, { stream: true });
          upsert();
        }
        upsert();
      } else if (res.ok) {
        const ct = res.headers.get("content-type") || "";
        assistantText = ct.includes("application/json")
          ? ((await res.json().catch(() => ({})))?.text || "Okay.")
          : (await res.text());
        upsert();
      } else {
        let err = `Sorry, ${label} endpoint returned ${res.status}.`;
        try {
          const ct = res.headers.get("content-type") || "";
          err = ct.includes("application/json") ? JSON.stringify(await res.json()) : await res.text();
        } catch {}
        setMessages((m) => [...m, { role: "assistant", content: `(error) ${err}` }]);
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: `Couldn’t reach ${endpoint}.` }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[1fr_auto] pb-4">
      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 overflow-y-auto px-6 pt-4 pb-3 space-y-4">
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

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t bg-white/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask anything… (${label})`}
            className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-3 text-slate-800 outline-none focus:ring-2 focus:ring-[#176A82]"}
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
