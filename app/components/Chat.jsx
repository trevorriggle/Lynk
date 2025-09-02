"use client";

import { useEffect, useRef, useState } from "react";

export default function Chat({ selectedModel }) {
  // Route all messages through the new session endpoint (server keeps memory)
  const endpoint = "/api/session";
  const label = selectedModel?.label || "Claude";

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // lightweight, per-tab session id so memory persists between turns
  const [sessionId] = useState(() => {
    try {
      const k = "lynk_session_id";
      const v = localStorage.getItem(k);
      if (v) return v;
      const id = crypto?.randomUUID?.() || ("sess_" + Math.random().toString(36).slice(2));
      localStorage.setItem(k, id);
      return id;
    } catch {
      return "sess_" + Math.random().toString(36).slice(2);
    }
  });

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Tiny debug so you can see the active target; remove later if you want
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log(
      "[Chat] Using model:",
      selectedModel?.label,
      selectedModel?.provider,
      selectedModel?.model,
      "→ endpoint:",
      endpoint
    );
  }, [endpoint, label, selectedModel]);

  // Always scroll to newest
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const userMsg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: text,
          model: {
            label: selectedModel?.label,
            provider: selectedModel?.provider,
            model: selectedModel?.model,
          },
        }),
      });

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

      if (res.ok && res.body) {
        // If the server streams, use it; if not, the else path below handles it
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
          err = ct.includes("application/json")
            ? JSON.stringify(await res.json())
            : await res.text();
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
      {/* Status line: confirm the pill is switching */}
      <div className="px-6 pt-2 text-xs text-slate-500">
        Using: <b>{label}</b> → <code>{endpoint}</code>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="min-h-0 overflow-y-auto px-6 pt-2 pb-3 space-y-4"
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

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t bg-white/95 backdrop-blur px-4 py-3"
      >
        <div className="mx-auto flex w/full max-w-3xl items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask anything… (${label})`}
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
