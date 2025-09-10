// components/RightPanel.jsx - collapsed-by-default snapshot info + per-row Copy + commands show "numbers?"
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

export default function RightPanel() {
  const [inspector, setInspector] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [authState, setAuthState] = useState({ loading: true, authenticated: false });
  const [collapsed, setCollapsed] = useState(new Set()); // indices collapsed

  // store state
  const { activeId, sessions, guestMessageCount } = useSessionStore((s) => ({
    activeId: s.activeId,
    sessions: s.sessions,
    guestMessageCount: s.guestMessageCount,
  }));

  // auth
  useEffect(() => {
    (async () => {
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
    })();
  }, []);

  // current message count
  const currentThread = activeId ? sessions[activeId]?.messages || [] : [];
  const threadUserMessageCount = currentThread.filter((m) => m?.role === "user").length;
  const currentUserMessageCount = authState.authenticated ? threadUserMessageCount : guestMessageCount;

  // inspector updates
  useEffect(() => {
    function onUpdate(e) {
      if (e?.detail) setInspector(e.detail);
    }
    window.addEventListener("inspector:update", onUpdate);
    return () => window.removeEventListener("inspector:update", onUpdate);
  }, []);

  // polling
  useEffect(() => {
    if (!activeId) {
      setInspector(null);
      setCollapsed(new Set());
      return;
    }

    const load = async () => {
      try {
        const r = await fetch(`/api/session?sessionId=${encodeURIComponent(activeId)}`, { cache: "no-store" });
        const j = await r.json();
        if (j?.inspector) setInspector(j.inspector);
      } catch (e) {
        console.warn("RightPanel polling error:", e);
      }
    };

    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [activeId]);

  // collapse all snapshots by default when list changes
  useEffect(() => {
    const snaps = inspector?.snapshots || [];
    const newSet = new Set();
    for (let i = 0; i < snaps.length; i++) newSet.add(i); // collapsed
    setCollapsed(newSet);
  }, [inspector?.snapshots?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // copy helper
  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1200);
    } catch {
      console.warn("Clipboard copy failed");
    }
  }

  // utilities
  const snapshots = inspector?.snapshots || [];
  const commands = inspector?.commands || [];
  const live = inspector?.live || {};
  const remainder = currentUserMessageCount % 5;
  const toNextSnapshot = remainder === 0 ? 0 : 5 - remainder;

  const buildSectionCopy = (s, key) => {
    if (!s) return "";
    switch (key) {
      case "topics":
        return (s.topics || [])
          .map((t) => `• ${t.slug}${t.gloss ? ` — ${t.gloss}` : ""}`)
          .join("\n");
      case "key_details":
        return (s.key_details || []).map((k) => `• ${k}`).join("\n");
      case "decisions":
        return (s.decisions || []).map((d) => `• ${d}`).join("\n");
      case "open_questions":
        return (s.open_questions || []).map((q) => `• ${q}`).join("\n");
      case "actions":
        return (s.actions || [])
          .map((a) => {
            const text = typeof a === "string" ? a : a?.text;
            const owner = a && typeof a === "object" && a.owner ? ` (${a.owner})` : "";
            return `• ${text}${owner}`;
          })
          .join("\n");
      default:
        return "";
    }
  };

  const sectionMeta = (s) =>
    s
      ? [
          { key: "topics", label: "Topics", count: s.topics?.length || 0 },
          { key: "key_details", label: "Key Details", count: s.key_details?.length || 0 },
          { key: "decisions", label: "Decisions", count: s.decisions?.length || 0 },
          { key: "open_questions", label: "Open Questions", count: s.open_questions?.length || 0 },
          { key: "actions", label: "Actions", count: s.actions?.length || 0 },
        ]
      : [];

  const latest = useMemo(() => snapshots.at(-1) || null, [snapshots]);

  return (
    <aside className="hidden w-80 shrink-0 lg:block px-4 pb-4 pt-0">
      <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-200/60 rounded-3xl p-5 h-full max-h-screen overflow-y-auto shadow-sm">
        {/* Header */}
        <div className="mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-800">Session Insights</h2>
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${authState.authenticated ? "bg-emerald-400" : "bg-amber-400"}`} />
              <span className="text-xs text-slate-500">{authState.authenticated ? "Verified" : "Guest"}</span>
            </div>
          </div>
          <div className="text-xs text-slate-400 space-y-1">
            <div>Messages: {currentUserMessageCount} • Snapshots: {snapshots.length}</div>
          </div>
        </div>

        {/* Live notes */}
        {authState.authenticated && live && Object.keys(live).length > 0 && (
          <div className="mb-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/60 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
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
                      <div className="w-1 h-1 bg-emerald-500 rounded-full mt-2 flex-shrink-0" />
                      <span className="text-xs text-emerald-800">{point}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Commands */}
        {commands.length > 0 && (
          <div className="mb-4 bg-gradient-to-r from-cyan-50 to-blue-50 border border-cyan-200/60 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 bg-cyan-500 rounded-full" />
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
                      addCommand({ label: c.command || c.slug });
                      setCopiedKey(`registry-${i}`);
                      setTimeout(() => setCopiedKey(null), 1000);
                    }}
                    className="text-xs px-3 py-1.5 bg-white/80 border border-cyan-200 rounded-full text-cyan-700 hover:bg-cyan-100 hover:border-cyan-300 transition-all duration-200 font-medium active:scale-95"
                    title={`Send "${c.command || c.slug}" to registry`}
                  >
                    {c.command || c.slug} {copiedKey === `registry-${i}` ? "✓" : ""}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Snapshots */}
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
              <p className="text-xs text-amber-700 leading-relaxed">Get automatic summaries every 5 messages.</p>
            </div>
          )}

          {authState.authenticated && snapshots.length === 0 && (
            <div className="bg-gradient-to-r from-slate-50 to-gray-50 border border-slate-200/60 rounded-2xl p-4 text-center">
              <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-xs text-slate-600 mb-1 font-medium">Building your first snapshot…</p>
              <p className="text-xs text-slate-500">({toNextSnapshot} more message{toNextSnapshot === 1 ? "" : "s"} to go)</p>
            </div>
          )}

          {snapshots.length > 0 && (
            <div className="space-y-3">
              {snapshots
                .slice()
                .reverse()
                .map((snap, i) => {
                  const displayIndex = i; // index in reversed view
                  const collapsedIndex = displayIndex; // keep simple mapping
                  const isCollapsed = collapsed.has(collapsedIndex);
                  const fields = sectionMeta(snap);

                  return (
                    <div
                      key={(snap.created_at || "") + i}
                      className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-200"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <button
                          onClick={() => {
                            const next = new Set(collapsed);
                            if (next.has(collapsedIndex)) next.delete(collapsedIndex);
                            else next.add(collapsedIndex);
                            setCollapsed(next);
                          }}
                          className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-800 font-medium"
                        >
                          <svg
                            className={`w-3 h-3 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          Turns {snap.from_turn ?? "?"}—{snap.to_turn ?? "?"} •{" "}
                          {new Date(snap.created_at).toLocaleDateString()}
                        </button>

                        {/* Copy ALL */}
                        <button
                          onClick={() => {
                            const all = ["topics", "key_details", "decisions", "open_questions", "actions"]
                              .map((k) => buildSectionCopy(snap, k))
                              .filter(Boolean)
                              .join("\n\n");
                            copy(all, `all-${i}`);
                          }}
                          className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium text-slate-600 transition-colors active:scale-95"
                        >
                          {copiedKey === `all-${i}` ? "Copied!" : "Copy All"}
                        </button>
                      </div>

                      {/* COLLAPSED: show section rows (name + count) each copyable */}
                      {isCollapsed && (
                        <div className="space-y-2">
                          {fields.map((f) => {
                            const k = `${f.key}-${i}`;
                            const text = buildSectionCopy(snap, f.key);
                            return (
                              <button
                                key={k}
                                onClick={() => copy(text, k)}
                                className="w-full flex items-center justify-between text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 transition-colors"
                                title="Click to copy this section"
                              >
                                <span className="font-medium text-slate-700">{f.label}</span>
                                <span className="text-slate-500">
                                  {copiedKey === k ? "✓ Copied" : f.count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* EXPANDED: show detailed items with per-section Copy */}
                      {!isCollapsed && (
                        <div className="space-y-3 mt-2">
                          {fields.map((f) => {
                            const text = buildSectionCopy(snap, f.key);
                            const k = `${f.key}-${i}`;
                            return (
                              <div key={k} className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-xs font-semibold text-slate-800">
                                    {f.label} {f.count ? `(${f.count})` : ""}
                                  </h4>
                                  <button
                                    onClick={() => copy(text, k)}
                                    className="text-xs px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-md font-medium transition-colors active:scale-95"
                                  >
                                    {copiedKey === k ? "Copied!" : "Copy"}
                                  </button>
                                </div>
                                {text ? (
                                  <pre className="text-[11px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                                    {text}
                                  </pre>
                                ) : (
                                  <div className="text-[11px] text-slate-400">No items</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
