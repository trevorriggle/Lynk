"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

export default function Chat({ selectedModel }) {
  // API endpoints
  const endpoint = "/api/session";
  const meEndpoint = "/api/me";

  const fallbackLabel = selectedModel?.label || "OpenAI";
  const { activeId, sessions, appendToActive, guestMessageCount } = useSessionStore((s) => s);

  // ======== identity from /api/me ========
  const [identity, setIdentity] = useState({
    ready: false,
    userId: null,
    projectId: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(meEndpoint, { cache: "no-store" });
        if (cancelled) return;
        if (r.status === 401) {
          setIdentity({ ready: true, userId: null, projectId: null, error: "unauthorized" });
          return;
        }
        if (!r.ok) throw new Error(await r.text().catch(() => String(r.status)));
        const j = await r.json();
        setIdentity({
          ready: true,
          userId: j?.userId || null,
          projectId: j?.projectId || null,
          error: null,
        });
      } catch (e) {
        setIdentity({ ready: true, userId: null, projectId: null, error: e?.message || "error" });
      }
    })();
    return () => { cancelled = true; };
  }, []);
  // =======================================

  // Derive the thread/model from the active session
  const thread = useMemo(
    () => (activeId ? sessions[activeId]?.messages || [] : []),
    [activeId, sessions]
  );

  const sessionModel = useMemo(
    () => (activeId ? sessions[activeId]?.model : selectedModel),
    [activeId, sessions, selectedModel]
  );

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // NEW: Check if user has hit the 5-message limit
  const isAuthenticated = identity.ready && !identity.error;
  const hasHitLimit = !isAuthenticated && guestMessageCount >= 10;

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log(
      "[Chat] Using model:",
      sessionModel?.label,
      sessionModel?.provider,
      sessionModel?.model,
      "→",
      endpoint,
      "sessionId:",
      activeId,
      "projectId:",
      identity.projectId,
      "guestMessages:",
      guestMessageCount
    );
  }, [endpoint, sessionModel, activeId, identity.projectId, guestMessageCount]);

  // Always scroll to newest message
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, sending]);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || !activeId) return;

    // If identity not ready, block send gracefully
    if (!identity.ready) return;

    // NEW: Block if guest user has hit 5-message limit
    if (hasHitLimit) {
      appendToActive({
        role: "assistant",
        content: "You've reached the 5-message limit. Please create an account to continue chatting! Click the 'AC' button in the top right to sign up.",
      });
      return;
    }

    // If unauthorized but under limit, allow sending
    if (identity.error === "unauthorized" && guestMessageCount < 5) {
      // Continue with normal flow
    }

    // 1) optimistic user message
    appendToActive({ role: "user", content: text });
    setInput("");
    setSending(true);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeId, // server keeps memory keyed by this
          message: text,       // send only the latest turn
          projectId: identity.projectId, // NEW: wire project to server
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
          window.dispatchEvent(
            new CustomEvent("inspector:update", { detail: data.inspector })
          );
        }
        appendToActive({ role: "assistant", content: assistantText });
      } else if (res.ok && res.body && ct.includes("text")) {
        // streaming fallback
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
        let err = `Sorry, ${sessionModel?.label || fallbackLabel} endpoint returned ${res.status}.`;
        try {
          err = ct.includes("application/json")
            ? JSON.stringify(await res.json())
            : await res.text();
        } catch {}
        appendToActive({ role: "assistant", content: `(error) ${err}` });
      }
    } catch (e) {
      appendToActive({ role: "assistant", content: `Couldn't reach ${endpoint}.` });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  // ========= REMOVED: Don't hide chat when limit reached =========

  // ========= EMPTY STATE (no active chat yet) =========
  if (!activeId) {
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_1fr_auto] pb-4">
        {/* Status line */}
        <div className="px-6 pt-2 text-xs text-slate-500">
          Using: <b>{fallbackLabel}</b> → <code>{endpoint}</code>{" "}
          {identity.ready ? (
            identity.error ? (
              <span className="text-rose-600">• guest mode ({guestMessageCount}/5 messages)</span>
            ) : (
              <span>• project: <code>{identity.projectId || "—"}</code></span>
            )
          ) : (
            <span>• loading identity…</span>
          )}
        </div>

        {/* Center message */}
        <div className="min-h-0 flex items-center justify-center px-6">
          <div className="text-center text-slate-500">
            <div className="text-base font-semibold mb-1">No chats yet</div>
            <div className="text-sm">
              Click <span className="font-semibold">New Chat</span> to get started.
            </div>
          </div>
        </div>

        {/* Disabled input look-alike */}
        <div className="border-t bg-white/95 backdrop-blur px-4 py-3">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
            <input
              disabled
              placeholder={`Ask anything… (${fallbackLabel})`}
              className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-3 text-slate-800 opacity-50"
            />
            <button
              disabled
              className="rounded-full px-5 py-3 font-medium text-white opacity-50"
              style={{ backgroundColor: "#176A82" }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }
  // ====================================================

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr_auto] pb-4">
      {/* Status line */}
      <div className="px-6 pt-2 text-xs text-slate-500">
        Using: <b>{sessionModel?.label || fallbackLabel}</b> → <code>{endpoint}</code>{" "}
        {identity.ready ? (
          identity.error ? (
            <span className="text-rose-600">• guest mode ({guestMessageCount}/10 messages)</span>
          ) : (
            <span>• project: <code>{identity.projectId || "—"}</code></span>
          )
        ) : (
          <span>• loading identity…</span>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="min-h-0 overflow-y-auto px-6 pt-2 pb-3 space-y-4"
      >
        {thread.map((m) => {
          const isUser = m.role === "user";
          return (
            <div
              key={m.id}
              className={`max-w-xl ${isUser ? "brand-user ml-auto" : "brand-agent"}`}
            >
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
            placeholder={
              hasHitLimit 
                ? "Message limit reached - create account to continue" 
                : `Ask anything… (${sessionModel?.label || fallbackLabel})`
            }
            className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-3 text-slate-800 outline-none focus:ring-2 focus:ring-[#176A82]"
            disabled={hasHitLimit}
          />
          <button
            type="submit"
            disabled={sending || !input.trim() || hasHitLimit || !identity.ready}
            className="rounded-full px-5 py-3 font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: "#176A82" }}
          >
            {hasHitLimit ? "Account Required" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}