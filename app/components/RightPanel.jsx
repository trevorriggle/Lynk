// components/RightPanel.jsx - Fixed terminology and timing
"use client";

import { useEffect, useState } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

export default function RightPanel() {
  const [inspector, setInspector] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [authState, setAuthState] = useState({ loading: true, authenticated: false });
  const [collapsedSnapshots, setCollapsedSnapshots] = useState(new Set());

  // Get active session and messages from store
  const { activeId, sessions, guestMessageCount } = useSessionStore((s) => ({
    activeId: s.activeId,
    sessions: s.sessions,
    guestMessageCount: s.guestMessageCount,
  }));

  // Check auth status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        if (r.ok) {
          const data = await r.json();
          setAuthState({ loading: false, authenticated: !!data.userId });
        } else {
          setAuthState({ loading: false, authenticated: false });
        }
      } catch {
        setAuthState({ loading: false, authenticated: false });
      }
    };
    checkAuth();
  }, []);

  // Get current thread and count user messages
  const currentThread = activeId ? sessions[activeId]?.messages || [] : [];
  const threadUserMessageCount = currentThread.filter((m) => m?.role === "user").length;
  const currentUserMessageCount = authState.authenticated ? threadUserMessageCount : guestMessageCount;

  // Listen for inspector updates from backend
  useEffect(() => {
    function onUpdate(e) {
      if (e?.detail) {
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

  // Copy helpers
  async function copySection(content, sectionKey) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedKey(sectionKey);
      setTimeout(() => setCopiedKey(null), 1200);
    } catch {
      console.warn("Failed to copy section to clipboard");
    }
  }

  function toggleSnapshot(index) {
    const newCollapsed = new Set(collapsedSnapshots);
    if (newCollapsed.has(index)) {
      newCollapsed.delete(index);
    } else {
      newCollapsed.add(index);
    }
    setCollapsedSnapshots(newCollapsed);
  }

  function copyAllSections(c, index) {
    const sections = [];
    if (c.topics?.length > 0) {
      sections.push("Topics:");
      sections.push(...c.topics.map((t) => `• ${t.slug}${t.gloss ? ` — ${t.gloss}` : ""}`));
      sections.push("");
    }
    if (c.key_details?.length > 0) {
      sections.push("Key Details:");
      sections.push(...c.key_details.map((k) => `• ${k}`));
      sections.push("");
    }
    if (c.decisions?.length > 0) {
      sections.push("Decisions:");
      sections.push(...c.decisions.map((d) => `• ${d}`));
      sections.push("");
    }
    if (c.open_questions?.length > 0) {
      sections.push("Open Questions:");
      sections.push(...c.open_questions.map((q) => `• ${q}`));
      sections.push("");
    }
    if (c.actions?.length > 0) {
      sections.push("Actions:");
      sections.push(
        ...c.actions.map((a) => {
          const actionText = typeof a === "string" ? a : a.text;
          const owner = a.owner ? ` (${a.owner})` : "";
          return `• ${actionText}${owner}`;
        })
      );
    }
    copySection(sections.join("\n").trim(), `all-${index}`);
  }

  const snapshots = inspector?.snapshots || [];
  const commands = inspector?.commands || [];
  const live = inspector?.live || {};

  return (
    <aside className="hidden w-80 shrink-0 lg:block px-4 pb-4 pt-0">
      <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-200/60 rounded-3xl p-5 h-full max-h-screen overflow-y-auto shadow-sm">
        
        {/* Header with session info */}
        <div className="mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-800">Session Insights</h2>
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${authState.authenticated ? 'bg-emerald-400' : 'bg-amber-400'}`}></div>
              <span className="text-xs text-slate-500">{authState.authenticated ? 'Verified' : 'Guest'}</span>
            </div>
          </div>
          <div className="text-xs text-slate-400 space-y-1">
            <div>Messages: {currentUserMessageCount} • Snapshots: {snapshots.length}</div>
          </div>
        </div>

        {/* Live notes - enhanced styling */}
        {authState.authenticated && live && Object.keys(live).length > 0 && (
          <div className="mb-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/60 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <h3 className="text-sm font-semibold text-emerald-800">Live Notes</h3>
            </div>
            {live.gist && (
              <div className="mb-3">
                <div className="text-xs font-medium text-emerald-700 mb-1">Summary</div>
                <div className="text-xs text-emerald-800 leading-relaxed">{live.gist}</div>
              </div>
            )}
            {live.key_points?.length > 0 && (
              <div>
                <div className="text-xs font-medium text-emerald-700 mb-1">Key Points</div>
                <div className="space-y-1">
                  {live.key_points.map((point, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-1 h-1 bg-emerald-500 rounded-full mt-2 flex-shrink-0"></div>
                      <span className="text-xs text-emerald-800">{point}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Command suggestions - enhanced styling */}
        {commands.length > 0 && (
          <div className="mb-4 bg-gradient-to-r from-cyan-50 to-blue-50 border border-cyan-200/60 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 bg-cyan-500 rounded-full"></div>
              <h3 className="text-sm font-semibold text-cyan-800">Suggestions</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {commands
                .slice()
                .reverse()
                .slice(0, 8)
                .map((c, i) => (
                  <button
                    key={(c.created_at || "") + i}
                    onClick={() => {
                      const { addCommand } = useSessionStore.getState();
                      addCommand({
                        label: c.command || c.slug + "?",
                      });
                      setCopiedKey(`registry-${i}`);
                      setTimeout(() => setCopiedKey(null), 1000);
                    }}
                    className="text-xs px-3 py-1.5 bg-white/80 border border-cyan-200 rounded-full text-cyan-700 hover:bg-cyan-100 hover:border-cyan-300 transition-all duration-200 font-medium active:scale-95"
                    title={`Send "${c.command || c.slug + "?"}" to registry`}
                  >
                    {c.slug}? {copiedKey === `registry-${i}` ? "✓" : ""}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Snapshots section */}
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Conversation Snapshots</h3>
          
          {!authState.authenticated && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-2xl p-4 text-center">
              <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v3m0-3h3m-3 0h-3m-3-11a3 3 0 013-3h6a3 3 0 013 3v4a3 3 0 01-3 3H9a3 3 0 01-3-3v-4z" />
                </svg>
              </div>
              <p className="text-xs text-amber-800 mb-2 font-medium">Snapshots for Verified Users</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                Get automatic conversation summaries every 5 messages with a verified account.
              </p>
            </div>
          )}

          {authState.authenticated && snapshots.length === 0 && (
            <div className="bg-gradient-to-r from-slate-50 to-gray-50 border border-slate-200/60 rounded-2xl p-4 text-center">
              <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-xs text-slate-600 mb-1 font-medium">Building your first snapshot...</p>
              <p className="text-xs text-slate-500">
                Snapshots appear every 5 messages ({Math.ceil(currentUserMessageCount / 5) * 5 - currentUserMessageCount} more to go)
              </p>
            </div>
          )}

          {snapshots.length > 0 && (
            <div className="space-y-3">
              {snapshots
                .slice()
                .reverse()
                .map((c, index) => (
                  <div
                    key={c.created_at + index}
                    className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-200"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => toggleSnapshot(index)}
                        className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-800 font-medium"
                      >
                        <svg 
                          className={`w-3 h-3 transition-transform ${collapsedSnapshots.has(index) ? '' : 'rotate-90'}`} 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        Turns {c.from_turn ?? "?"}—{c.to_turn ?? "?"} • {new Date(c.created_at).toLocaleDateString()}
                      </button>
                      <button
                        onClick={() => copyAllSections(c, index)}
                        className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium text-slate-600 transition-colors active:scale-95"
                      >
                        {copiedKey === `all-${index}` ? "Copied!" : "Copy"}
                      </button>
                    </div>

                    {!collapsedSnapshots.has(index) && (
                      <div className="space-y-3">
                        {c.topics?.length > 0 && (
                          <SnapshotSection
                            title="Topics"
                            items={c.topics.map(t => `${t.slug}${t.gloss ? ` — ${t.gloss}` : ""}`)}
                            onCopy={() => {
                              const text = c.topics.map(t => `• ${t.slug}${t.gloss ? ` — ${t.gloss}` : ""}`).join("\n");
                              copySection(text, `topics-${index}`);
                            }}
                            copied={copiedKey === `topics-${index}`}
                            color="purple"
                          />
                        )}

                        {c.key_details?.length > 0 && (
                          <SnapshotSection
                            title="Key Details"
                            items={c.key_details}
                            onCopy={() => {
                              const text = c.key_details.map(k => `• ${k}`).join("\n");
                              copySection(text, `details-${index}`);
                            }}
                            copied={copiedKey === `details-${index}`}
                            color="blue"
                          />
                        )}

                        {c.decisions?.length > 0 && (
                          <SnapshotSection
                            title="Decisions"
                            items={c.decisions}
                            onCopy={() => {
                              const text = c.decisions.map(d => `• ${d}`).join("\n");
                              copySection(text, `decisions-${index}`);
                            }}
                            copied={copiedKey === `decisions-${index}`}
                            color="green"
                          />
                        )}

                        {c.open_questions?.length > 0 && (
                          <SnapshotSection
                            title="Open Questions"
                            items={c.open_questions}
                            onCopy={() => {
                              const text = c.open_questions.map(q => `• ${q}`).join("\n");
                              copySection(text, `questions-${index}`);
                            }}
                            copied={copiedKey === `questions-${index}`}
                            color="amber"
                          />
                        )}

                        {c.actions?.length > 0 && (
                          <SnapshotSection
                            title="Actions"
                            items={c.actions.map(a => {
                              const text = typeof a === "string" ? a : a.text;
                              const owner = a.owner ? ` (${a.owner})` : "";
                              return `${text}${owner}`;
                            })}
                            onCopy={() => {
                              const text = c.actions.map(a => {
                                const actionText = typeof a === "string" ? a : a.text;
                                const owner = a.owner ? ` (${a.owner})` : "";
                                return `• ${actionText}${owner}`;
                              }).join("\n");
                              copySection(text, `actions-${index}`);
                            }}
                            copied={copiedKey === `actions-${index}`}
                            color="red"
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// Helper component for consistent snapshot section styling
function SnapshotSection({ title, items, onCopy, copied, color = "slate" }) {
  const colorClasses = {
    purple: "bg-purple-50 border-purple-200 text-purple-800",
    blue: "bg-blue-50 border-blue-200 text-blue-800", 
    green: "bg-emerald-50 border-emerald-200 text-emerald-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    red: "bg-rose-50 border-rose-200 text-rose-800",
    slate: "bg-slate-50 border-slate-200 text-slate-800"
  };

  const dotColors = {
    purple: "bg-purple-400",
    blue: "bg-blue-400",
    green: "bg-emerald-400", 
    amber: "bg-amber-400",
    red: "bg-rose-400",
    slate: "bg-slate-400"
  };

  return (
    <div className={`${colorClasses[color]} border rounded-xl p-3`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold">{title}</h4>
        <button
          onClick={onCopy}
          className="text-xs px-2 py-0.5 bg-white/60 hover:bg-white/80 rounded-md font-medium transition-colors active:scale-95"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className={`w-1 h-1 ${dotColors[color]} rounded-full mt-2 flex-shrink-0`}></div>
            <span className="text-xs leading-relaxed">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}