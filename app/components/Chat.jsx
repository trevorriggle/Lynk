"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useSessionStore } from "../hooks/useSessionStore";

export default function Chat({ selectedModel }) {
  const endpoint = "/api/session";
  const meEndpoint = "/api/me";
  const fallbackLabel = selectedModel?.label || "OpenAI";

  const { activeId, sessions, appendToActive, guestMessageCount } = useSessionStore((s) => s);

  // ---------------------- Auth state ----------------------
  const [authState, setAuthState] = useState({
    loading: true,
    authenticated: false,
    userId: null,
    projectId: null,
    userEmail: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(meEndpoint, { cache: "no-store", credentials: "include" });
        if (cancelled) return;

        if (r.status === 401) {
          setAuthState({
            loading: false,
            authenticated: false,
            userId: null,
            projectId: null,
            userEmail: null,
            error: "guest",
          });
          return;
        }
        if (!r.ok) {
          setAuthState({
            loading: false,
            authenticated: false,
            userId: null,
            projectId: null,
            userEmail: null,
            error: "server_error",
          });
          return;
        }

        const data = await r.json();
        if (data?.userId) {
          setAuthState({
            loading: false,
            authenticated: true,
            userId: data.userId,
            projectId: data.projectId || null,
            userEmail: data.project?.email || null,
            error: null,
          });
        } else {
          setAuthState({
            loading: false,
            authenticated: false,
            userId: null,
            projectId: null,
            userEmail: null,
            error: "invalid_response",
          });
        }
      } catch (e) {
        if (cancelled) return;
        setAuthState({
          loading: false,
          authenticated: false,
          userId: null,
          projectId: null,
          userEmail: null,
          error: "network_error",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------- Session + model ----------------------
  const thread = useMemo(
    () => (activeId ? sessions[activeId]?.messages || [] : []),
    [activeId, sessions]
  );

  const sessionModel = useMemo(
    () => (activeId ? sessions[activeId]?.model : selectedModel),
    [activeId, sessions, selectedModel]
  );

  // ---------------------- Message limits ----------------------
  const getUserMessageCount = () => thread.filter((m) => m && m.role === "user").length;
  const getMessageLimit = () => (authState.authenticated ? 20 : 10);
  const getCurrentCount = () => (authState.authenticated ? getUserMessageCount() : guestMessageCount);
  const hasHitLimit = () =>
    authState.authenticated ? getUserMessageCount() >= 20 : guestMessageCount >= 10;

  const getStatusText = () => {
    if (authState.loading) return "• loading identity…";
    const current = getCurrentCount();
    const limit = getMessageLimit();
    return authState.authenticated
      ? `• authenticated (${current}/${limit} messages) • project: ${authState.projectId || "—"}`
      : `• guest mode (${current}/${limit} messages)`;
  };

  // ---------------------- UI state ----------------------
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  // Expanding textarea refs/state
  const taRef = useRef(null);
  const [isComposing, setIsComposing] = useState(false);
  const MAX_ROWS = 5;

  // Auto-scroll messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, sending]);

  // Auto-resize textarea up to MAX_ROWS
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    const line = parseInt(getComputedStyle(el).lineHeight || "24", 10);
    const max = line * MAX_ROWS;
    el.style.height = Math.min(el.scrollHeight, max) + "px";
  }, [input]);

  // ---------------------- Submit ----------------------
  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || !activeId || authState.loading) return;

    if (hasHitLimit()) {
      if (authState.authenticated) {
        appendToActive({
          role: "assistant",
          content:
            "You've reached the 20-message limit for authenticated users. Upgrade to Premium for unlimited messaging!",
        });
      } else {
        appendToActive({
          role: "assistant",
          content:
            "You've reached the 10-message limit for guest users. Please create an account to get 20 messages! Click 'Sign In/Create Account' in the top right.",
        });
      }
      return;
    }

    // optimistic append
    appendToActive({ role: "user", content: text });
    setInput("");
    setSending(true);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId: activeId,
          message: text,
          projectId: authState.projectId,
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
          err = ct.includes("application/json") ? JSON.stringify(await res.json()) : await res.text();
        } catch {}
        appendToActive({ role: "assistant", content: `(error) ${err}` });
      }
    } catch (_e) {
      appendToActive({ role: "assistant", content: `Couldn't reach ${endpoint}.` });
    } finally {
      setSending(false);
      taRef.current?.focus();
    }
  }

  // ---------------------- Empty state ----------------------
  if (!activeId) {
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_1fr_auto] pb-4">
        <div className="px-6 pt-2 text-xs text-slate-500">
          Using: <b>{fallbackLabel}</b> → <code>{endpoint}</code> {getStatusText()}
        </div>
        <div className="min-h-0 flex items-center justify-center px-6">
          <div className="text-center text-slate-500">
            <div className="text-base font-semibold mb-1">No chats yet</div>
            <div className="text-sm">
              Click <span className="font-semibold">New Chat</span> to get started.
              {authState.authenticated
                ? ` You have ${getMessageLimit()} messages available.`
                : ` As a guest, you get ${getMessageLimit()} free messages.`}
            </div>
          </div>
        </div>
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

  // ---------------------- Main chat ----------------------
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr_auto] pb-4">
      {/* Status line */}
      <div className="px-6 pt-2 text-xs text-slate-500">
        Using: <b>{sessionModel?.label || fallbackLabel}</b> → <code>{endpoint}</code> {getStatusText()}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 overflow-y-auto px-6 pt-2 pb-3 space-y-4">
        {thread.map((m) => {
          const isUser = m.role === "user";
          return (
            <div key={m.id} className={`max-w-xl ${isUser ? "brand-user ml-auto" : "brand-agent"}`}>
              {isUser ? (
                m.content
              ) : (
                <div className="markdown-content">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-2 first:mt-0">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{children}</h3>,
                      ul: ({ children }) => <ul className="mb-2 ml-4 list-disc">{children}</ul>,
                      ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal">{children}</ol>,
                      code: ({ children }) => (
                        <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                      ),
                      pre: ({ children }) => (
                        <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto mb-2">{children}</pre>
                      ),
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      em: ({ children }) => <em className="italic">{children}</em>,
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          );
        })}
        {sending && <div className="max-w-xl brand-agent">Thinking…</div>}
      </div>

      {/* Composer — clean expanding textarea */}
      <form onSubmit={handleSubmit} className="border-t bg-white/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
          <div className="flex-1 rounded-full border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-[#176A82] focus-within:border-[#176A82] transition-all">
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              onKeyDown={(e) => {
                // Enter = send. Shift+Enter = newline. IME-safe.
                if (e.key === "Enter" && !e.shiftKey && !isComposing) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={
                hasHitLimit()
                  ? "Message limit reached - create account to continue"
                  : `Ask anything… (${sessionModel?.label || fallbackLabel})`
              }
              className="block w-full resize-none bg-transparent px-4 py-3 text-slate-800 outline-none border-none leading-6 max-h-40 overflow-auto"
              disabled={hasHitLimit() || authState.loading}
              aria-label="Message"
              style={{ scrollbarGutter: "stable" }}
            />
          </div>

          <button
            type="submit"
            disabled={sending || !input.trim() || hasHitLimit() || authState.loading}
            className="rounded-full px-5 py-3 font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: "#176A82" }}
          >
            {hasHitLimit() ? "Account Required" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}