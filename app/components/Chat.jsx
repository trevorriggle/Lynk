"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useSessionStore } from "../hooks/useSessionStore";

function formatTimeAgo(timestamp) {
  const now = new Date();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return timestamp.toLocaleDateString();
}

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

function QuickActionsDropdown({ onAction, onClose }) {
  const fileInputRef = useRef(null);

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onAction('file-upload', files);
    }
    e.target.value = '';
  };

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
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-3 w-full text-left px-4 py-3 text-slate-700 hover:bg-slate-50 border-b border-slate-100"
      >
        <AttachIcon className="h-4 w-4" />
        <span className="text-sm font-medium">Upload Files</span>
      </button>
      
      <button
        onClick={() => onAction('camera')}
        className="flex items-center gap-3 w-full text-left px-4 py-3 text-slate-700 hover:bg-slate-50"
      >
        <CameraIcon className="h-4 w-4" />
        <span className="text-sm font-medium">Take Photo</span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.txt,.md,.json,.csv,.js,.py,.jsx,.tsx,.ts,.pdf,.doc,.docx"
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );
}

export default function Chat() {
  const endpoint = "/api/session";
  const meEndpoint = "/api/me";
  
  const { selectedModel, activeId, sessions, appendToActive, guestMessageCount, addContextFile } = useSessionStore(s => ({
    selectedModel: s.selectedModel,
    activeId: s.activeId,
    sessions: s.sessions,
    appendToActive: s.appendToActive,
    guestMessageCount: s.guestMessageCount,
    addContextFile: s.addContextFile,
  }));
  
  const fallbackLabel = selectedModel?.label || "OpenAI";

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
            error: null,
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

  const thread = useMemo(
    () => (activeId ? sessions[activeId]?.messages || [] : []),
    [activeId, sessions]
  );

  const sessionModel = selectedModel;

  const getUserMessageCount = () => thread.filter((m) => m && m.role === "user").length;
  const getMessageLimit = () => (authState.authenticated ? 20 : 10);
  const getCurrentCount = () => (authState.authenticated ? getUserMessageCount() : guestMessageCount);
  const hasHitLimit = () => {
    if (authState.loading) return false;
    if (authState.authenticated) {
      return getUserMessageCount() >= 20;
    } else {
      return guestMessageCount >= 10;
    }
  };

  const getStatusText = () => {
    if (authState.loading) return "• loading identity…";
    const current = getCurrentCount();
    const limit = getMessageLimit();
    return authState.authenticated
      ? `• authenticated (${current}/${limit} messages) • project: ${authState.projectId || "—"}`
      : `• guest mode (${current}/${limit} messages)`;
  };

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const quickActionsRef = useRef(null);
  const [isComposing, setIsComposing] = useState(false);
  const MAX_ROWS = 5;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, sending]);

  // Auto-send API request for user messages with attachments
  useEffect(() => {
    const lastMessage = thread[thread.length - 1];
    if (lastMessage &&
        lastMessage.role === "user" &&
        lastMessage.attachments?.some(att => att.type === "image") &&
        !sending &&
        activeId) {

      // Send the image message to the API
      handleImageMessageSubmit(lastMessage);
    }
  }, [thread, sending, activeId]);

  const handleImageMessageSubmit = async (imageMessage) => {
    if (sending) return;

    setSending(true);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId: activeId,
          message: imageMessage.content,
          attachments: imageMessage.attachments,
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
        assistantText = data?.text || "I can see your image, but I'm having trouble analyzing it right now.";
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
        appendToActive({ role: "assistant", content: assistantText || "I can see your image." });
      } else if (res.ok) {
        assistantText = await res.text();
        appendToActive({ role: "assistant", content: assistantText || "I can see your image." });
      } else {
        let err = `Sorry, ${sessionModel?.label || fallbackLabel} endpoint returned ${res.status}.`;
        try {
          err = ct.includes("application/json") ? JSON.stringify(await res.json()) : await res.text();
        } catch {}
        appendToActive({ role: "assistant", content: `(error) ${err}` });
      }
    } catch (_e) {
      appendToActive({ role: "assistant", content: `Couldn't reach ${endpoint}. Please try again.` });
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    const line = parseInt(getComputedStyle(el).lineHeight || "24", 10);
    const max = line * MAX_ROWS;
    el.style.height = Math.min(el.scrollHeight, max) + "px";
  }, [input]);

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

  const handleQuickAction = (action, files) => {
    setShowQuickActions(false);
    
    try {
      switch (action) {
        case 'draw':
          window.dispatchEvent(new CustomEvent("interact:open", { detail: { type: "draw" } }));
          break;
        case 'file-upload':
          handleFileUpload(files);
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

  const handleFileUpload = (files) => {
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (activeId) {
            appendToActive({
              role: "user",
              content: `I've uploaded an image: ${file.name}. Please analyze this image.`,
              attachments: [{
                type: "image",
                data: e.target.result,
                filename: file.name,
                timestamp: new Date().toISOString()
              }]
            });
          }
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          addContextFile({
            label: file.name,
            content: e.target.result,
            type: file.type,
            size: file.size
          });
          
          if (activeId) {
            appendToActive({
              role: "user",
              content: `[File attached: ${file.name}]`,
              attachments: [{
                type: "file",
                name: file.name,
                content: e.target.result,
                timestamp: new Date().toISOString()
              }]
            });
          }
        };
        reader.readAsText(file);
      }
    });
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || !activeId || authState.loading) return;

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

    const newMessage = { role: "user", content: text };
    appendToActive(newMessage);
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

  if (!activeId) {
    return (
      <div className="flex flex-col h-full font-['Poppins',sans-serif]">
        <div className="shrink-0 px-6 pt-2 text-xs text-slate-500 font-light">
          Using: <b className="font-medium">{fallbackLabel}</b> → <code>{endpoint}</code> {getStatusText()}
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center px-6">
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
        <div className="shrink-0 border-t bg-white/95 backdrop-blur px-4 py-3">
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

  return (
    <div className="flex flex-col h-full font-['Poppins',sans-serif]">
      <div className="shrink-0 px-6 pt-2 text-xs text-slate-500 font-light">
        Using: <b className="font-medium">{sessionModel?.label || fallbackLabel}</b> → <code>{endpoint}</code> {getStatusText()}
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-6 pt-2 pb-3 space-y-4">
        {thread.map((m) => {
          const isUser = m.role === "user";
          const timestamp = new Date(m.timestamp || Date.now());
          const timeAgo = formatTimeAgo(timestamp);
          
          let modelInfo = null;
          if (m.model) {
            if (typeof m.model === 'string') {
              modelInfo = m.model;
            } else if (m.model.label) {
              modelInfo = m.model.label;
            } else if (m.model.provider && m.model.model) {
              modelInfo = `${m.model.provider} ${m.model.model}`;
            }
          } else if (m.provider) {
            modelInfo = m.provider;
          } else if (!isUser) {
            modelInfo = sessionModel?.label || 'AI';
          }
          
          return (
            <div key={m.id} className={`${isUser ? "ml-auto text-slate-800 max-w-[85%]" : ""}`}>
              {isUser ? (
                <div className="text-right">
                  <div className="text-slate-800 font-normal break-words overflow-wrap-anywhere">
                    {m.attachments?.some(att => att.type === "image") && (
                      <div className="mb-3 space-y-2">
                        {m.attachments
                          .filter(att => att.type === "image")
                          .map((att, idx) => (
                            <div key={idx} className="relative group">
                              <img
                                src={att.data}
                                alt={att.filename || "Created with Lynk Image Editor"}
                                className="max-w-full max-h-72 rounded-lg border border-slate-200 shadow-md cursor-pointer hover:shadow-lg transition-shadow"
                                onClick={() => {
                                  const newWindow = window.open('', '_blank');
                                  newWindow.document.write(`
                                    <html>
                                      <head><title>Lynk Image</title></head>
                                      <body style="margin:0;padding:20px;background:#000;display:flex;justify-content:center;align-items:center;min-height:100vh;">
                                        <img src="${att.data}" style="max-width:100%;max-height:100%;object-fit:contain;" />
                                      </body>
                                    </html>
                                  `);
                                }}
                              />
                              {att.filename && (
                                <div className="text-xs text-gray-500 mt-1">{att.filename}</div>
                              )}
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="bg-[#176A82] text-white px-2 py-1 rounded text-xs font-medium">
                                  Click to enlarge
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                    {m.content}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 opacity-0 hover:opacity-100 transition-opacity">
                    {timeAgo}
                  </div>
                </div>
              ) : (
                <div className="inline-block max-w-[85%]">
                  <div className="bg-[#ededed] text-slate-800 rounded-xl p-3 shadow-sm border border-slate-200">
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
                  <div className="text-xs text-slate-500 mt-1 opacity-0 hover:opacity-100 transition-opacity flex items-center gap-2">
                    <span>{timeAgo}</span>
                    {modelInfo && (
                      <>
                        <span>•</span>
                        <span className="px-1.5 py-0.5 bg-[#176A82] text-white rounded text-[10px] font-medium">
                          {modelInfo}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {sending && <div className="inline-block brand-agent font-light">Thinking…</div>}
      </div>

      <form onSubmit={handleSubmit} className="shrink-0 border-t bg-white/95 backdrop-blur px-4 py-3 pb-6">
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
          <div ref={quickActionsRef} className="relative">
            <button
              type="button"
              onClick={() => setShowQuickActions(!showQuickActions)}
              className="flex items-center justify-center w-10 h-10 rounded-full border border-slate-300 bg-white hover:bg-slate-50 hover:border-[#176A82] transition-colors"
              title="Quick actions"
              disabled={hasHitLimit() || authState.loading}
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

          <div className="flex-1 rounded-2xl border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-[#176A82] focus-within:border-[#176A82] transition-all">
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              onKeyDown={(e) => {
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
              className="block w-full resize-none bg-transparent px-4 py-3 text-slate-800 outline-0 border-0 leading-6 max-h-32 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent focus:outline-0 font-normal"
              disabled={hasHitLimit() || authState.loading}
              aria-label="Message"
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