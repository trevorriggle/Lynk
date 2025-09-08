// components/RightPanel.jsx - Simplified to only show real snapshots
"use client";

import { useEffect, useState } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

// Create a clean, actionable summary for copy
function formatCardForCopy(c) {
  const lines = [];
  
  // Key details section
  if (c.key_details?.length > 0) {
    lines.push("Key Details:");
    c.key_details.forEach((detail) => lines.push(`• ${detail}`));
    lines.push(""); // blank line
  }
  
  // Actions section  
  if (c.actions?.length > 0) {
    lines.push("Actions:");
    c.actions.forEach((action) => {
      const actionText = typeof action === 'string' ? action : action.text;
      const owner = action.owner ? ` (${action.owner})` : "";
      lines.push(`• ${actionText}${owner}`);
    });
    lines.push(""); // blank line
  }
  
  // Open questions section
  if (c.open_questions?.length > 0) {
    lines.push("Open Questions:");
    c.open_questions.forEach((question) => lines.push(`• ${question}`));
    lines.push(""); // blank line
  }
  
  // Decisions section
  if (c.decisions?.length > 0) {
    lines.push("Decisions Made:");
    c.decisions.forEach((decision) => lines.push(`• ${decision}`));
  }
  
  return lines.join("\n").trim();
}

export default function RightPanel() {
  const [inspector, setInspector] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [authState, setAuthState] = useState({ loading: true, authenticated: false });

  // Get active session and messages from store
  const { activeId, sessions, guestMessageCount } = useSessionStore((s) => ({
    activeId: s.activeId,
    sessions: s.sessions,
    guestMessageCount: s.guestMessageCount
  }));

  // Check auth status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        if (r.ok) {
          const data = await r.json();
          setAuthState({
            loading: false,
            authenticated: !!data.userId,
          });
        } else {
          setAuthState({
            loading: false,
            authenticated: false,
          });
        }
      } catch {
        setAuthState({
          loading: false,
          authenticated: false,
        });
      }
    };
    checkAuth();
  }, []);

  // Get current thread and count user messages
  const currentThread = activeId ? sessions[activeId]?.messages || [] : [];
  const threadUserMessageCount = currentThread.filter(m => m?.role === "user").length;
  
  // Use appropriate message count
  const currentUserMessageCount = authState.authenticated ? threadUserMessageCount : guestMessageCount;

  // Listen for inspector updates from backend
  useEffect(() => {
    function onUpdate(e) {
      if (e?.detail) {
        console.log("RightPanel received inspector update:", e.detail);
        setInspector(e.detail);
      }
    }
    window.addEventListener("inspector:update", onUpdate);
    return () => window.removeEventListener("inspector:update", onUpdate);
  }, []);

  // Poll backend for inspector data
  useEffect(() => {
    if (!activeId) {
      setInspector(null);
      return;
    }

    const load = async () => {
      try {
        const r = await fetch(`/api/session?sessionId=${encodeURIComponent(activeId)}`);
        const j = await r.json();
        if (j?.inspector) {
          setInspector(j.inspector);
        }
      } catch (e) {
        console.warn("RightPanel polling error:", e);
      }
    };
    
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [activeId]);

  async function copyCard(c) {
    try {
      await navigator.clipboard.writeText(formatCardForCopy(c));
      setCopiedKey(c.key || Math.random().toString());
      setTimeout(() => setCopiedKey(null), 1200);
    } catch {
      console.warn("Failed to copy card to clipboard");
    }
  }

  // Get snapshots from inspector (real data only)
  const snapshots = inspector?.snapshots || [];

  return (
    <aside className="hidden w-80 shrink-0 lg:block px-4 pb-4 pt-0">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-[10px] text-slate-400">
          session: <code>{activeId || "—"}</code> • user messages: {currentUserMessageCount} • auth: {authState.authenticated ? "yes" : "no"} • snapshots: {snapshots.length}
        </div>

        <div className="mb-1 text-sm font-semibold text-slate-800">Previews</div>
        {snapshots.length === 0 ? (
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Previews will appear here after every 5 messages as the AI creates conversation snapshots.
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {snapshots.slice().reverse().map((c, index) => (
              <div
                key={c.created_at + index}
                className="rounded-md border border-green-200 bg-green-50 p-2 text-xs leading-5 text-slate-700"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[11px] text-slate-500">
                    turns {c.from_turn ?? "?"}—{c.to_turn ?? "?"} • {new Date(c.created_at).toLocaleString()}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {c.confidence && (
                      <span className="text-[10px] rounded-full border px-1.5 py-0.5 text-slate-500">
                        {c.confidence}
                      </span>
                    )}
                    <button
                      onClick={() => copyCard(c)}
                      className="text-[11px] rounded-md border px-2 py-0.5 hover:bg-slate-50 active:scale-[0.99]"
                      title="Copy preview text"
                    >
                      {copiedKey === (c.key || (c.created_at + index)) ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                {c.topics?.length > 0 && (
                  <div className="mt-1">
                    <div className="font-medium">Topics</div>
                    <ul className="list-disc pl-4">
                      {c.topics.map((t, i) => (
                        <li key={i}>
                          <b>{t.slug}</b>
                          {t.gloss ? ` — ${t.gloss}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {c.key_details?.length > 0 && (
                  <div className="mt-1">
                    <div className="font-medium">Key details</div>
                    <ul className="list-disc pl-4">
                      {c.key_details.map((k, i) => (
                        <li key={i}>{k}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {c.decisions?.length > 0 && (
                  <div className="mt-1">
                    <div className="font-medium">Decisions</div>
                    <ul className="list-disc pl-4">
                      {c.decisions.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {c.open_questions?.length > 0 && (
                  <div className="mt-1">
                    <div className="font-medium">Open questions</div>
                    <ul className="list-disc pl-4">
                      {c.open_questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {c.actions?.length > 0 && (
                  <div className="mt-1">
                    <div className="font-medium">Actions</div>
                    <ul className="list-disc pl-4">
                      {c.actions.map((a, i) => (
                        <li key={i}>
                          {a.text}
                          {a.owner ? (
                            <span className="text-slate-500"> — {a.owner}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}