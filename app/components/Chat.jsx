"use client";
import { useEffect, useRef, useState } from "react";

export default function Chat({ model, onCommand }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Welcome to Lynk. Continue, discuss new ideas, or do anything else." }
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(""); // e.g., Missing API key
  const listRef = useRef(null);

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }), 0);
  }, [messages]);

  async function send() {
    const content = text.trim();
    if (!content || busy) return;

    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setText("");
    setBusy(true);
    setBanner("");

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: next, temperature: 0.4 })
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || "Upstream error");
      setMessages([...next, { role: "assistant", content: json.reply ?? "" }]);
    } catch (e) {
      if (/missing api key/i.test(e.message)) setBanner("Missing API key");
      setMessages([...next, { role: "assistant", content: `⚠️ ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {banner && (
        <div className="px-4 pt-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-600/30 bg-amber-900/20 px-3 py-1 text-xs text-amber-200">
            <span>⚠️</span> {banner}
          </div>
        </div>
      )}

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div
              className={
                "inline-block max-w-[72ch] rounded-2xl px-4 py-2 text-sm leading-6 shadow-sm " +
                (m.role === "user"
                  ? "bg-blue-600/20 border border-blue-500/30"
                  : "bg-zinc-900 border border-zinc-800")
              }
            >
              {m.content}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-zinc-800 p-3">
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask anything… (try: flinn?)"
            className="w-full rounded-full border border-zinc-700 bg-zinc-950 px-4 py-2 outline-none"
          />
          <button
            onClick={send}
            disabled={busy}
            className="rounded-xl bg-zinc-100 px-4 py-2 text-zinc-900 hover:bg-white disabled:opacity-60"
          >
            {busy ? "Thinking…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
