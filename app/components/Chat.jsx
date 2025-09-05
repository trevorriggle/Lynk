"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useSessionStore } from "../hooks/useSessionStore";

export default function Chat({ selectedModel }) {
  // API endpoints
  const endpoint = "/api/session";
  const meEndpoint = "/api/me";

  const fallbackLabel = selectedModel?.label || "OpenAI";
  const { activeId, sessions, appendToActive, guestMessageCount } = useSessionStore((s) => s);

  // ======== IMPROVED: Better auth state management ========
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
        const r = await fetch(meEndpoint, { 
          cache: "no-store",
          credentials: "include", // Important for cookies
        });
        if (cancelled) return;
        
        if (r.status === 401) {
          // Clearly unauthorized - user is a guest
          setAuthState({ 
            loading: false, 
            authenticated: false, 
            userId: null, 
            projectId: null, 
            userEmail: null,
            error: "guest" 
          });
          return;
        }
        
        if (!r.ok) {
          // Server error - treat as guest but log the issue
          console.warn("Auth check failed with status:", r.status);
          setAuthState({ 
            loading: false, 
            authenticated: false, 
            userId: null, 
            projectId: null, 
            userEmail: null,
            error: "server_error" 
          });
          return;
        }

        const data = await r.json();
        if (data?.userId) {
          // Successfully authenticated
          setAuthState({
            loading: false,
            authenticated: true,
            userId: data.userId,
            projectId: data.projectId || null,
            userEmail: data.project?.email || null,
            error: null,
          });
        } else {
          // Invalid response format - treat as guest
          setAuthState({ 
            loading: false, 
            authenticated: false, 
            userId: null, 
            projectId: null, 
            userEmail: null,
            error: "invalid_response" 
          });
        }
      } catch (e) {
        if (cancelled) return;
        // Network error - treat as guest
        console.warn("Auth check network error:", e.message);
        setAuthState({ 
          loading: false, 
          authenticated: false, 
          userId: null, 
          projectId: null, 
          userEmail: null,
          error: "network_error" 
        });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ======== IMPROVED: Different message limits based on auth status ========
  const getMessageLimit = () => {
    if (authState.authenticated) {
      return 20; // Authenticated users get 20 messages
    }
    return 10; // Guests get 10 messages
  };

  const hasHitLimit = !authState.authenticated && guestMessageCount >= getMessageLimit();
  const currentLimit = getMessageLimit();

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

  useEffect(() => {
    console.log(
      "[Chat] Using model:",
      sessionModel?.label,
      sessionModel?.provider,
      sessionModel?.model,
      "→",
      endpoint,
      "sessionId:",
      activeId,
      "auth:",
      authState.authenticated ? "authenticated" : "guest",
      "messages:",
      `${guestMessageCount}/${currentLimit}`
    );
  }, [endpoint, sessionModel, activeId, authState, guestMessageCount, currentLimit]);

  // Always scroll to newest message
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, sending]);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || !activeId) return;

    // Wait for auth state to be determined
    if (authState.loading) return;

    // Block if guest user has hit limit
    if (hasHitLimit) {
      appendToActive({
        role: "assistant",
        content: `You've reached the ${currentLimit}-message limit for guest users. Please create an account to get ${authState.authenticated ? 'unlimited' : '20'} messages! Click the "Sign In/Create Account" button in the top right.`,
      });
      return;
    }

    // 1) optimistic user message
    appendToActive({ role: "user", content: text });
    setInput("");
    setSending(true);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Important for auth cookies
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

  // ======== IMPROVED: Status line shows auth state clearly ========
  const getStatusText = () => {
    if (authState.loading) return "• loading identity…";
    if (authState.authenticated) {
      return `• authenticated • project: ${authState.projectId || "—"}`;
    }
    return `• guest mode (${guestMessageCount}/${currentLimit} messages)`;
  };

  // ======== EMPTY STATE (no active chat yet) =========
  if (!activeId) {
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_1fr_auto] pb-4">
        {/* Status line */}
        <div className="px-6 pt-2 text-xs text-slate-500">
          Using: <b>{fallbackLabel}</b> → <code>{endpoint}</code> {getStatusText()}
        </div>

        {/* Center message */}
        <div className="min-h-0 flex items-center justify-center px-6">
          <div className="text-center text-slate-500">
            <div className="text-base font-semibold mb-1">No chats yet</div>
            <div className="text-sm">
              Click <span className="font-semibold">New Chat</span> to get started.
              {authState.authenticated 
                ? ` You have ${currentLimit} messages available.`
                : ` As a guest, you get ${currentLimit} free messages.`
              }
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

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr_auto] pb-4">
      {/* Status line */}
      <div className="px-6 pt-2 text-xs text-slate-500">
        Using: <b>{sessionModel?.label || fallbackLabel}</b> → <code>{endpoint}</code> {getStatusText()}
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
              {isUser ? (
                m.content
              ) : (
                <div className="markdown-content">
                  <ReactMarkdown 
                    components={{
                      p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                      h1: ({children}) => <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h1>,
                      h2: ({children}) => <h2 className="text-base font-bold mb-2 mt-2 first:mt-0">{children}</h2>,
                      h3: ({children}) => <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{children}</h3>,
                      ul: ({children}) => <ul className="mb-2 ml-4 list-disc">{children}</ul>,
                      ol: ({children}) => <ol className="mb-2 ml-4 list-decimal">{children}</ol>,
                      code: ({children}) => <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
                      pre: ({children}) => <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto mb-2">{children}</pre>,
                      strong: ({children}) => <strong className="font-semibold">{children}</strong>,
                      em: ({children}) => <em className="italic">{children}</em>,
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
            disabled={hasHitLimit || authState.loading}
          />
          <button
            type="submit"
            disabled={sending || !input.trim() || hasHitLimit || authState.loading}
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