"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

function FileUpload({ onFileUpload, onClose }) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const handleFiles = (files) => {
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        onFileUpload({
          key: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          label: file.name,
          content: e.target.result,
          type: file.type,
          size: file.size
        });
      };
      reader.readAsText(file);
    });
    onClose();
  };

  return (
    <div className="mb-2 p-3 border-2 border-dashed border-[#176A82] rounded-xl bg-white/50">
      <div 
        className={`p-4 rounded-lg transition-colors ${
          isDragging ? 'bg-[#176A82]/10' : 'bg-gray-50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="text-center">
          <div className="text-sm text-gray-600 mb-2">
            Drag files here or click to browse
          </div>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1 bg-[#176A82] text-white rounded-lg text-sm hover:opacity-90"
            >
              Browse Files
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1 bg-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Supports: .txt, .md, .json, .csv, .js, .py, .jsx, .tsx, .ts, .html, .css
          </div>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.md,.json,.csv,.js,.py,.jsx,.tsx,.ts,.html,.css"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}

function Section({ title, defaultOpen = false, children, badge = null }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl !bg-[#176A82] text-white shadow-sm hover:bg-[#176A82]/90 transition"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold">{title}</span>
          {badge && (
            <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </div>
        <span
          className={`transition-transform select-none ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          ▸
        </span>
      </button>

      <div className={`transition-all overflow-hidden ${open ? "max-h-[600px] mt-2" : "max-h-0"}`}>
        <div className="rounded-xl border !border-[#C7EBEA]/60 bg-white pt-4 px-3 pb-3">
          <div className="space-y-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, onClick, onDelete, muted = false, active = false, pill = false, deletable = false, icon = null }) {
  const pillBase =
    "w-full rounded-full bg-white px-4 py-3 text-base leading-4 text-slate-800 transition outline-none select-none truncate";
  const pillInactive =
    "border border-slate-300 hover:border-[#176A82] hover:ring-1 hover:ring-[#176A82]/30";
  const pillActive =
    "border-2 border-[#176A82] ring-2 ring-[#176A82]/40 shadow-[inset_0_0_0_1px_rgba(23,106,130,0.20)] font-medium";

  const nonPillBase =
    "w-full text-left px-3 py-2.5 rounded-lg ring-1 ring-black/5 transition truncate";
  const nonPillInactive =
    "!hover:bg-[#C7EBEA]/30 active:!bg-[#C7EBEA]/50 hover:!border-[#C7EBEA]/60";
  const nonPillActive = "bg-white border font-semibold shadow";

  const cls = pill
    ? [pillBase, active ? pillActive : pillInactive, muted ? "text-slate-500 italic" : ""].join(" ")
    : [nonPillBase, active ? nonPillActive : nonPillInactive, muted ? "text-slate-500 italic" : "text-slate-800"].join(" ");

  if (deletable) {
    return (
      <div className="relative group">
        <button
          type="button"
          onClick={onClick}
          aria-current={active ? "true" : undefined}
          className={cls}
          title={label}
        >
          <div className="flex items-center gap-2">
            {icon && <span className="text-sm">{icon}</span>}
            <span className="truncate">{label}</span>
          </div>
        </button>
        <button
          type="button"
          title="Delete"
          aria-label="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#176A82] hover:opacity-80 text-xl leading-none opacity-0 group-hover:opacity-100 transition-opacity"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cls}
      title={label}
    >
      <div className="flex items-center gap-2">
        {icon && <span className="text-sm">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
    </button>
  );
}

export default function EnhancedLeftStack({ onActivate }) {
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [authState, setAuthState] = useState({ loading: true, authenticated: false, userId: null });
  
  const {
    order,
    sessions,
    activeId,
    selectSession,
    createSession,
    deleteSession,
    contextFiles = [],
    behaviors = [],
    commands = [],
    deleteContextFile,
    deleteBehavior,
    deleteCommand,
    addContextFile,
    sendMessage,
    clearSessions,
  } = useSessionStore((s) => s);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        if (r.ok) {
          const userData = await r.json();
          const newAuthState = {
            loading: false,
            authenticated: !!userData?.userId,
            userId: userData?.userId || null
          };

          // Only clear sessions when switching between different authenticated users
          // Don't clear when going from guest to authenticated (login) or authenticated to guest (logout)
          if (authState.authenticated && newAuthState.authenticated &&
              authState.userId !== newAuthState.userId &&
              authState.userId !== null && newAuthState.userId !== null) {
            clearSessions?.();
          }

          setAuthState(newAuthState);
        } else {
          const newAuthState = { loading: false, authenticated: false, userId: null };

          // Only clear sessions when switching between different authenticated users
          // Don't clear when going from authenticated to guest (logout)
          if (authState.authenticated && authState.userId !== null &&
              newAuthState.authenticated && newAuthState.userId !== null &&
              authState.userId !== newAuthState.userId) {
            clearSessions?.();
          }

          setAuthState(newAuthState);
        }
      } catch {
        const newAuthState = { loading: false, authenticated: false, userId: null };

        // Only clear sessions when switching between different authenticated users
        // Don't clear when going from authenticated to guest (error/logout)
        if (authState.authenticated && authState.userId !== null &&
            newAuthState.authenticated && newAuthState.userId !== null &&
            authState.userId !== newAuthState.userId) {
          clearSessions?.();
        }

        setAuthState(newAuthState);
      }
    })();
  }, []);

  const recent = useMemo(() => {
    const allSessions = order
      .map((id) => sessions[id])
      .filter(Boolean);

    console.log('All sessions:', allSessions.map(s => ({ id: s.id, userId: s.userId, title: s.title })));
    console.log('Auth state:', { authenticated: authState.authenticated, userId: authState.userId });

    const filtered = allSessions.filter((session) => {
      if (!authState.authenticated) {
        // Guest user - show sessions with no userId
        return !session.userId;
      }
      // Authenticated user - show sessions with matching userId
      return session.userId === authState.userId;
    });

    console.log('Filtered sessions:', filtered.map(s => ({ id: s.id, userId: s.userId, title: s.title })));

    return filtered;
  }, [order, sessions, authState.authenticated, authState.userId]);

  const handleFileUpload = (fileData) => {
    addContextFile(fileData);
    setShowFileUpload(false);
  };

  const executeCommand = (command) => {
    const { guestMessageCount } = useSessionStore.getState();

    // Hard stop for guest users at message limit
    if (!authState.authenticated && guestMessageCount >= 10) {
      console.log("Guest message limit reached, command execution blocked");
      return;
    }

    // Simply send the command as a regular message to the LLM
    const commandText = command.label || command.command;
    if (sendMessage) {
      sendMessage(commandText);
    }
  };

  const totalCommands = commands.length;
  const recentCommands = commands.slice(-6);

  const handleNewChat = () => {
    try {
      const userId = authState.authenticated ? authState.userId : null;
      console.log('Creating new session with userId:', userId, 'authState:', authState);
      const newSessionId = createSession(null, userId);
      console.log('Created new session:', newSessionId);
      selectSession(newSessionId);
      console.log('Selected new session:', newSessionId);
    } catch (error) {
      console.error('Failed to create new session:', error);
    }
  };

  if (authState.loading) {
    return (
      <aside className="h-full w-full px-3 pb-3 pt-4 !bg-[#C7EBEA] overflow-y-auto">
        <div className="flex items-center justify-center h-32">
          <div className="text-sm text-gray-600">Loading...</div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="h-full w-full px-3 pb-3 pt-4 !bg-[#C7EBEA] overflow-y-auto">
      
      <Section title="Context Files" badge={contextFiles.length || null} defaultOpen={false}>
        {showFileUpload && (
          <FileUpload 
            onFileUpload={handleFileUpload}
            onClose={() => setShowFileUpload(false)}
          />
        )}
        
        {contextFiles.map(file => (
          <Row 
            key={file.key}
            label={file.label}
            onClick={() => onActivate?.({ type: "file", key: file.key, data: file })}
            onDelete={() => deleteContextFile(file.key)}
            deletable
          />
        ))}
        
        <Row 
          label="+ Upload Files" 
          onClick={() => setShowFileUpload(true)} 
          muted 
        />
      </Section>

      <Section title="Behaviors" badge={behaviors.length || null}>
        {behaviors.map(behavior => (
          <Row 
            key={behavior.key}
            label={behavior.label}
            onClick={() => onActivate?.({ type: "behavior", key: behavior.key })}
            onDelete={() => deleteBehavior(behavior.key)}
            deletable
          />
        ))}
        <Row 
          label="+ Add Behavior"
          onClick={() => onActivate?.({ type: "behavior", key: "add-new" })} 
          muted 
        />
      </Section>

      <Section title="Commands" badge={totalCommands || null}>
        {recentCommands.length > 0 ? (
          <>
            <div className="text-xs text-gray-600 mb-2 px-1">Recent suggestions:</div>
            {recentCommands.map(command => (
              <Row 
                key={command.key || `${command.slug}-${command.created_at}`}
                label={command.command || command.label}
                onClick={() => executeCommand(command)}
                onDelete={() => deleteCommand(command.key)}
                deletable={!!command.key}
              />
            ))}
            <div className="pt-1 border-t border-gray-200 mt-2">
              <Row 
                label="See All Commands"
                onClick={() => onActivate?.({ type: "command", key: "see-all" })} 
                muted 
              />
            </div>
          </>
        ) : (
          <div className="text-xs text-gray-500 italic px-1">
            Commands appear after topic mentions (every 4th mention generates suggestions)
          </div>
        )}
      </Section>


      <Section title="Recent Chats" badge={recent.length || null} defaultOpen={false}>
        {!authState.authenticated && (
          <div className="text-xs text-gray-500 italic px-1 mb-2">
            Guest sessions (sign in to sync chats across devices)
          </div>
        )}
        
        {authState.authenticated && (
          <div className="text-xs text-gray-600 px-1 mb-2">
            Your conversations
          </div>
        )}
        
        {recent.length === 0 ? (
          <Row label="(no chats yet)" muted pill />
        ) : (
          recent.map((s) => {
            const active = s.id === activeId;
            return (
              <div key={s.id} className="relative group">
                <Row
                  label={s.title || "New chat"}
                  active={active}
                  onClick={() => selectSession(s.id)}
                  pill
                />
                <button
                  type="button"
                  title="Delete chat"
                  aria-label="Delete chat"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(s.id);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#176A82] hover:opacity-80 text-xl leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            );
          })
        )}
        
        <div className="pt-2 border-t border-gray-200">
          <Row
            label="+ New Chat"
            onClick={handleNewChat}
            muted
            pill
          />
        </div>
        
        {!authState.authenticated && recent.length > 0 && (
          <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">
            Guest chats are not synced. Sign in to save your conversations.
          </div>
        )}
      </Section>
    </aside>
  );
}