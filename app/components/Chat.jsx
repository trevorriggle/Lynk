"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useSessionStore } from "../hooks/useSessionStore";

// Quick Action Icons
function PlusIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
      <circle cx="12" cy="12" r="10" strokeWidth="2"/>
      <path d="M8 12h8" strokeWidth="2"/>
      <path d="M12 8v8" strokeWidth="2"/>
    </svg>
  );
}

function PencilIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" strokeWidth="2"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" strokeWidth="2"/>
    </svg>
  );
}

function AttachIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.64 16.2a2 2 0 0 1-2.83-2.83l8.49-8.49" strokeWidth="2"/>
    </svg>
  );
}

function CameraIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" strokeWidth="2"/>
      <circle cx="12" cy="13" r="4" strokeWidth="2"/>
    </svg>
  );
}

// Quick Actions Dropdown
function QuickActionsDropdown({ onAction, onClose }) {
  return (
    <div className="absolute bottom-12 left-0 w-48 rounded-2xl overflow-hidden shadow-xl bg-white border border-slate-200 z-50">
      <button
        onClick={() => onAction('draw')}
        className="flex items-center gap-3 w-full text-left px-4 py-3 text-slate-700 hover:bg-slate-50 border-b border-slate-100"
      >
        <PencilIcon className="h-4 w-4" />
        <span className="text-sm font-medium">Draw & Sketch</span>
      </button>
      
      <button
        onClick={() => onAction('attach')}
        className="flex items-center gap-3 w-full text-left px-4 py-3 text-slate-700 hover:bg-slate-50 border-b border-slate-100"
      >
        <AttachIcon className="h-4 w-4" />
        <span className="text-sm font-medium">Attach File</span>
      </button>
      
      <button
        onClick={() => onAction('camera')}
        className="flex items-center gap-3 w-full text-left px-4 py-3 text-slate-700 hover:bg-slate-50"
      >
        <CameraIcon className="h-4 w-4" />
        <span className="text-sm font-medium">Take Photo</span>
      </button>
    </div>
  );
}

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
      ? `• authenticated (${current}/${limit} messages) • project: ${authState.projectId || "–"}`
      : `• guest mode (${current}/${limit} messages)`;
  };

  // ---------------------- UI state ----------------------
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const scrollRef = useRef(null);

  // Expanding textarea refs/state
  const taRef = useRef(null);
  const quickActionsRef = useRef(null);
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

  // Close quick actions on outside click
  useEffect(() => {
    const onDocDown = (e) => {
      if (!quickActionsRef.current) return;
      if (!quickActionsRef.current.contains(e.target)) {
        setShowQuickActions(false);
      }
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  // ---------------------- Quick Actions Handler ----------------------
  const handleQuickAction = (action) => {
    setShowQuickActions(false);
    
    // Dispatch events for different actions
    try {
      switch (action) {
        case 'draw':
          window.dispatchEvent(new CustomEvent("interact:open", { detail: { type: "draw" } }));
          break;
        case 'attach':
          window.dispatchEvent(new CustomEvent("interact:open", { detail: { type: "attach" } }));
          break;
        case 'camera':
          window.dispatchEvent(new CustomEvent("interact:open", { detail: { type: "camera" } }));
          break;
        default:
          console.log(`Quick action: ${action}`);
      }
    } catch (error) {
      console.warn("Failed to dispatch quick action event:", error);
    }
  };

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
      <div className="grid h-full min-h-0 grid-rows-[auto_1fr_auto] pb-4 font-['Poppins',sans-serif]">
        <div className="px-6 pt-2 text-xs text-slate-500 font-light">
          Using: <b className="font-medium">{fallbackLabel}</b> → <code>{endpoint}</code> {getStatusText()}
        </div>
        <div className="min-h-0 flex items-center justify-center px-6">
          <div className="text-center text-slate-500">
            <div className="text-base font-medium mb-1">No chats yet</div>
            <div className="text-sm font-light">
              Click <span className="font-medium">New Chat</span> to get started.
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
              className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-3 text-slate-800 opacity-50 font-light"
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
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr_auto] pb-4 font-['Poppins',sans-serif]">
      {/* Status line */}
      <div className="px-6 pt-2 text-xs text-slate-500 font-light">
        Using: <b className="font-medium">{sessionModel?.label || fallbackLabel}</b> → <code>{endpoint}</code> {getStatusText()}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 overflow-y-auto px-6 pt-2 pb-3 space-y-4">
        {thread.map((m) => {
          const isUser = m.role === "user";
          return (
            <div key={m.id} className={`${isUser ? "ml-auto text-slate-800 max-w-[85%]" : ""}`}>
              {isUser ? (
                <div className="text-right text-slate-800 font-normal break-words overflow-wrap-anywhere">
                  {m.content}
                </div>
              ) : (
                <div className="bg-[#ededed] text-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 inline-block max-w-[85%]">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0 font-normal text-slate-800">{children}</p>,
                      h1: ({ children }) => <h1 className="text-lg font-medium mb-2 mt-3 first:mt-0 text-slate-800">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-base font-medium mb-2 mt-2 first:mt-0 text-slate-800">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-medium mb-1 mt-2 first:mt-0 text-slate-800">{children}</h3>,
                      ul: ({ children }) => <ul className="mb-2 ml-4 list-disc text-slate-800">{children}</ul>,
                      ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal text-slate-800">{children}</ol>,
                      li: ({ children }) => <li className="text-slate-800 font-normal">{children}</li>,
                      code: ({ children }) => (
                        <code className="bg-gray-200 px-1 py-0.5 rounded text-xs font-mono text-slate-800">{children}</code>
                      ),
                      pre: ({ children }) => (
                        <pre className="bg-gray-200 p-3 rounded text-sm overflow-x-auto mb-2 text-slate-800 font-mono border">{children}</pre>
                      ),
                      strong: ({ children }) => <strong className="font-medium text-slate-800">{children}</strong>,
                      em: ({ children }) => <em className="italic text-slate-800">{children}</em>,
                      a: ({ children, href }) => <a href={href} className="text-[#176A82] underline font-normal hover:text-[#0d4a5a] transition-colors">{children}</a>,
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          );
        })}
        {sending && <div className="inline-block brand-agent font-light">Thinking…</div>}
      </div>

      {/* Enhanced Composer with Quick Actions */}
      <form onSubmit={handleSubmit} className="border-t bg-white/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
          {/* Quick Actions Button */}
          <div ref={quickActionsRef} className="relative">
            <button
              type="button"
              onClick={() => setShowQuickActions(!showQuickActions)}
              className="flex items-center justify-center w-10 h-10 rounded-full border border-slate-300 bg-white hover:bg-slate-50 hover:border-[#176A82] transition-colors"
              title="Quick actions"
              disabled={hasHitLimit || authState.loading}
            >
              <PlusIcon className="h-5 w-5 text-slate-600" />
            </button>
            
            {showQuickActions && (
              <QuickActionsDropdown 
                onAction={handleQuickAction}
                onClose={() => setShowQuickActions(false)}
              />
            )}
          </div>

          {/* Text Input */}
          <div className="flex-1 rounded-2xl border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-[#176A82] focus-within:border-[#176A82] transition-all">
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
                hasHitLimit
                  ? "Message limit reached - create account to continue"
                  : `Ask anything… (${sessionModel?.label || fallbackLabel})`
              }
              className="block w-full resize-none bg-transparent px-4 py-3 text-slate-800 outline-0 border-0 leading-6 max-h-32 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent focus:outline-0 font-normal"
              disabled={hasHitLimit || authState.loading}
              aria-label="Message"
            />
          </div>

          {/* Send Button */}
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