"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

export default function Chat({ selectedModel }) {
  // Your memory-aware endpoint
  const endpoint = "/api/session";
  const label = selectedModel?.label || "OpenAI";

  const { activeId, sessions, createSession, appendToActive } = useSessionStore((s) => s);

  // Guarantee there is an active session
  useEffect(() => {
    if (!activeId) {
      createSession(
        selectedModel || { label: "Claude", provider: "anthropic", model: "claude-3-haiku-20240307" }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Derive the thread from the active session
  const thread = useMemo(() => (activeId ? sessions[activeId]?.messages || [] : []), [activeId, sessions]);
  const sessionModel = useMemo(
    () => (activeId ? sessions[activeId]?.model : selectedModel),
    [activeId, sessions, selectedModel]
  );

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[Chat] Using model:", sessionModel?.label, sessionModel?.provider, sessionModel?.model, "→", endpoint, "sessionId:", activeId);
  }, [endpoint, sessionModel, activeId]);

  // Always scroll to newest message
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, sending]);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || !activeId) return;

    // 1) optimistic user message
    appendToActive({ role: "user", content: text });
    setInput("");
    setSending(true);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeId, // server uses this to keep memory
          message: text,       // send only the latest turn; server already has memory
          model: {
            label: sessionModel?.label,
            provider: sessionModel?.provider,
            model: sessionModel?.model,
          },
        }),
      });

      let assistantText = "";

      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (res.ok && ct.includes("application/json")) {
        const data = await res.json().catch(() => ({}));
        assistantText = data?.text || "Okay.";
        if (data?.inspector && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("inspector:update", { detail: data.inspector }));
        }
        appendToActive({ role: "assistant", content: assistantText });
      } else if (res.ok && res.body && ct.includes("text")) {
        // streaming text fallback
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          assistantText += decoder.decode(value, { stream: true });
        }
        appendToActive({ role: "assistant", content: assistantText || " " });
      } else if (res.ok) {
        assistantText = await res.text();
        appendToActive({ role: "assistant", content: assistantText || " " });
      } else {
        let err = `Sorry, ${label} endpoint returned ${res.status}.`;
        try {
          err = ct.includes("application/json") ? JSON.stringify(await res.json()) : await res.text();
        } catch {}
        appendToActive({ role: "assistant", content: `(error) ${err}` });
      }
    } catch (e) {
      appendToActive({ role: "assistant", content: `Couldn’t reach ${endpoint}.` });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[1fr_auto] pb-4">
      {/* Status line */}
      <div className="px-6 pt-2 text-xs text-slate-500">
        Using: <b>{sessionModel?.label || label}</b> → <code>{endpoint}</code>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 overflow-y-auto px-6 pt-2 pb-3 space-y-4">
        {thread.map((m) => {
          const isUser = m.role === "user";
          return (
            <div key={m.id} className={`max-w-xl ${isUser ? "brand-user ml-auto" : "brand-agent"}`}>
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
            placeholder={`Ask anything… (${sessionModel?.label || label})`}
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
