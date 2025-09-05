"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useSessionStore } from "../hooks/useSessionStore";

export default function Chat({ selectedModel }) {
  const endpoint = "/api/session";
  const meEndpoint = "/api/me";
  const fallbackLabel = selectedModel?.label || "OpenAI";
  
  const { activeId, sessions, appendToActive, guestMessageCount } = useSessionStore((s) => s);

  // Auth state management
  const [authState, setAuthState] = useState({
    loading: true,
    authenticated: false,
    userId: null,
    projectId: null,
    userEmail: null,
    error: null,
  });

  // Check authentication
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(meEndpoint, { 
          cache: "no-store",
          credentials: "include",
        });
        if (cancelled) return;
        
        if (r.status === 401) {
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
            error: "invalid_response" 
          });
        }
      } catch (e) {
        if (cancelled) return;
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

  // Get current thread and model
  const thread = useMemo(
    () => (activeId ? sessions[activeId]?.messages || [] : []),
    [activeId, sessions]
  );

  const sessionModel = useMemo(
    () => (activeId ? sessions[activeId]?.model : selectedModel),
    [activeId, sessions, selectedModel]
  );

  // Message counting and limits
  const getUserMessageCount = () => {
    return thread.filter(m => m && m.role === "user").length;
  };

  const getMessageLimit = () => {
    return authState.authenticated ? 20 : 10;
  };

  const getCurrentCount = () => {
    return authState.authenticated ? getUserMessageCount() : guestMessageCount;
  };

  const hasHitLimit = () => {
    if (authState.authenticated) {
      return getUserMessageCount() >= 20;
    } else {
      return guestMessageCount >= 10;
    }
  };

  // Status text with message counts
  const getStatusText = () => {
    if (authState.loading) return "• loading identity…";
    
    const currentCount = getCurrentCount();
    const limit = getMessageLimit();
    
    if (authState.authenticated) {
      return `• authenticated (${currentCount}/${limit} messages) • project: ${authState.projectId || "—"}`;
    }
    return `• guest mode (${currentCount}/${limit} messages)`;
  };

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Debug logging
  useEffect(() => {
    console.log("[Chat] Auth:", authState.authenticated, "Count:", getCurrentCount(), "Limit:", getMessageLimit());
  }, [authState, thread, guestMessageCount]);

  // Auto scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, sending]);

  // Handle form submission
  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || !activeId || authState.loading) return;

    // Check message limits
    if (hasHitLimit()) {
      if (authState.authenticated) {
        appendToActive({
          role: "assistant",
          content: "You've reached the 20-message limit for authenticated users. Upgrade to Premium for unlimited messaging!",
        });
      } else {
        appendToActive({
          role: "assistant",
          content: "You've reached the 10-message limit for guest users. Please create an account to get 20 messages! Click 'Sign In/Create Account' in the top right.",
        });
      }
      return;
    }

    // Send message
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
          window.dispatchEvent(
            new CustomEvent("inspector:update", { detail: data.inspector })
          );
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

  // Empty state (no active chat)
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
                : ` As a guest, you get ${getMessageLimit()} free messages.`
              }
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

  // Main chat interface
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
              hasHitLimit() 
                ? "Message limit reached - create account to continue" 
                : `Ask anything… (${sessionModel?.label || fallbackLabel})`
            }
            className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-3 text-slate-800 outline-none focus:ring-2 focus:ring-[#176A82]"
            disabled={hasHitLimit() || authState.loading}
          />
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