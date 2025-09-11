// components/RightPanel.jsx — Live Notes visible for logged-in users, full contents in-bubble
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

export default function RightPanel() {
  // Auth + inspector state
  const [authState, setAuthState] = useState({ loading: true, authenticated: false, userId: null });
  const [inspector, setInspector] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  // App/session store
  const { activeId, sessions, guestMessageCount } = useSessionStore((s) => ({
    activeId: s.activeId,
    sessions: s.sessions,
    guestMessageCount: s.guestMessageCount,
  }));

  // ---- Auth bootstrap ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store", credentials: "include" });
        if (cancelled) return;
        if (r.ok) {
          const j = await r.json();
          setAuthState({ loading: false, authenticated: !!j?.userId, userId: j?.userId || null });
        } else {
          setAuthState({ loading: false, authenticated: false, userId: null });
        }
      } catch {
        if (!cancelled) setAuthState({ loading: false, authenticated: false, userId: null });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Reset inspector when auth flips (avoid stale guest inspector)
  useEffect(() => {
    setInspector(null);
  }, [authState.authenticated, authState.userId]);

  // Current thread counts (cosmetic)
  const currentThread = activeId ? (sessions[activeId]?.messages || []) : [];
  const threadUserCount = currentThread.filter((m) => m?.role === "user").length;
  const currentUserMessageCount = authState.authenticated ? threadUserCount : guestMessageCount;

  // ---- Listen for app events that carry inspector payloads ----
  useEffect(() => {
    const onUpdate = (e) => {
      if (e?.detail) setInspector(e.detail);
    };
    const onMessageResponse = (e) => {
      if (e?.detail?.inspector) setInspector(e.detail.inspector);
    };
    window.addEventListener("inspector:update", onUpdate);
    window.addEventListener("message:response", onMessageResponse);
    return () => {
      window.removeEventListener("inspector:update", onUpdate);
      window.removeEventListener("message:response", onMessageResponse);
    };
  }, []);

  // ---- Poll /api/session for the active session ----
  useEffect(() => {
    if (!activeId || authState.loading) {
      setInspector(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/session?sessionId=${encodeURIComponent(activeId)}`, {
          cache: "no-store",
          credentials: "include",
        });
        if (!cancelled && r.ok) {
          const j = await r.json();
          if (j?.inspector) setInspector(j.inspector);
        }
      } catch {
        // silent fail
      }
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [activeId, authState.loading]);

  // ---- Data shaping ----
  const liveHistory = useMemo(() => {
    const hx = inspector?.live_history || [];
    // newest first
    return hx.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [inspector]);

  const suggestions = inspector?.commands || [];
  const liveBadge = liveHistory.length;

  // ---- Clipboard helpers ----
  const copy = useCallback(async (text, key) => {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1200);
    } catch {
      // silent
    }
  }, []);

  const buildSnapshotCopy = useCallback((s) => {
    const blocks = [];
    if (s.gist) blocks.push(`SUMMARY\n${s.gist}`);
    if (Array.isArray(s.key_points) && s.key_points.length) {
      blocks.push(`KEY POINTS\n${s.key_points.map((p) => `• ${p}`).join("\n")}`);
    }
    if (Array.isArray(s.entities) && s.entities.length) {
      blocks.push(`ENTITIES\n${s.entities.map((e) => `• ${e}`).join("\n")}`);
    }
    if (Array.isArray(s.actions) && s.actions.length) {
      blocks.push(`ACTIONS\n${s.actions.map((a) => `• ${a}`).join("\n")}`);
    }
    if (Array.isArray(s.insights) && s.insights.length) {
      blocks.push(`INSIGHTS\n${s.insights.map((i) => `• ${i}`).join("\n")}`);
    }
    return blocks.join("\n\n");
  }, []);

  // ---- UI helpers ----
  const Chip = ({ children }) => (
    <span className="text-[11px] px-2 py-1 rounded-full border bg-white/80 border-emerald-300 text-emerald-900">
      {children}
    </span>
  );

  // ---- Render ----
  if (authState.loading) {
    return (
      <aside className="hidden w-80 shrink-0 lg:block px-4 pb-4 pt-0">
        <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-300 rounded-3xl p-5 h-full max-h-screen overflow-y-auto shadow-sm">
          <div className="flex items-center justify-center h-32">
            <div className="text-sm text-slate-600">Loading…</div>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden w-80 shrink-0 lg:block px-4 pb-4 pt-0">
      <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-300 rounded-3xl p-5 h-full max-h-screen overflow-y-auto shadow-sm">

        {/* Header */}
        <div className="mb-4 pb-3 border-b border-slate-200">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-slate-900">Session Insights</h2>
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${authState.authenticated ? "bg-emerald-600" : "bg-amber-600"}`} />
              <span className="text-xs text-slate-700">{authState.authenticated ? "Verified" : "Guest"}</span>
            </div>
          </div>
          <div className="text-xs text-slate-600">Session Messages: {currentUserMessageCount}</div>
        </div>

        {/* Live Notes */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-emerald-900">Live Notes</h3>
            <div
              className={`min-w-6 h-6 px-2 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                liveBadge > 0 ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"
              }`}
              title="Snapshots appear for logged in users"
            >
              {liveBadge}
            </div>
          </div>

          {!authState.authenticated && (
            <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-300 rounded-2xl p-4 text-xs text-amber-900">
              Sign in to enable Live Notes and see real-time summaries, points, entities, actions, and insights.
            </div>
          )}

          {authState.authenticated && liveBadge === 0 && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-300 rounded-2xl p-4 text-xs text-emerald-900">
              Snapshots appear automatically for logged-in users as the conversation progresses.
            </div>
          )}

          {authState.authenticated && liveBadge > 0 && (
            <div className="space-y-3">
              {liveHistory.map((s) => {
                const id = `${s.created_at}|${s.from_turn}|${s.to_turn}`;
                const when = new Date(s.created_at);
                const header = `User turns ${s.from_turn}—${s.to_turn}`;
                const fullCopy = buildSnapshotCopy(s);

                return (
                  <div
                    key={id}
                    className="bg-gradient-to-r from-emerald-100 to-teal-100 border border-emerald-300 rounded-2xl p-4 shadow-sm"
                  >
                    {/* Bubble header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex flex-col">
                        <div className="text-xs font-semibold text-emerald-950">{header}</div>
                        <div className="text-[11px] text-emerald-900/80">
                          {when.toLocaleDateString()} · {when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Chip>Snapshot</Chip>
                        <button
                          onClick={() => copy(fullCopy, `all-${id}`)}
                          className="text-xs px-3 py-1.5 rounded-full border bg-white/80 border-emerald-300 text-emerald-900 hover:bg-white active:scale-95 transition font-medium"
                          title="Copy all contents"
                        >
                          {copiedKey === `all-${id}` ? "Copied!" : "Copy All"}
                        </button>
                      </div>
                    </div>

                    {/* Bubble body — always expanded */}
                    <div className="space-y-3">
                      {/* Summary */}
                      {s.gist ? (
                        <div className="border border-emerald-300 rounded-xl p-3 bg-white/80">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-emerald-900">Summary</div>
                            <button
                              onClick={() => copy(s.gist, `summary-${id}`)}
                              className="text-xs px-3 py-1.5 rounded-full border bg-white/80 border-emerald-300 text-emerald-900 hover:bg-white transition"
                            >
                              {copiedKey === `summary-${id}` ? "Copied!" : "Copy"}
                            </button>
                          </div>
                          <div className="text-xs text-emerald-900 whitespace-pre-wrap leading-relaxed">{s.gist}</div>
                        </div>
                      ) : null}

                      {/* Key Points */}
                      {Array.isArray(s.key_points) && s.key_points.length > 0 && (
                        <div className="border border-emerald-300 rounded-xl p-3 bg-white/80">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-emerald-900">Key Points</div>
                            <button
                              onClick={() => copy(s.key_points.map((p) => `• ${p}`).join("\n"), `kps-${id}`)}
                              className="text-xs px-3 py-1.5 rounded-full border bg-white/80 border-emerald-300 text-emerald-900 hover:bg-white transition"
                            >
                              {copiedKey === `kps-${id}` ? "Copied!" : "Copy"}
                            </button>
                          </div>
                          <div className="space-y-1">
                            {s.key_points.map((p, i) => (
                              <div
                                key={`kp-${i}`}
                                className="text-xs text-emerald-900 bg-white/70 border border-emerald-200 rounded-lg p-2 cursor-pointer hover:bg-white/90 transition"
                                onClick={() => copy(p, `kp-${id}-${i}`)}
                                title="Click to copy"
                              >
                                • {p}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Entities */}
                      {Array.isArray(s.entities) && s.entities.length > 0 && (
                        <div className="border border-emerald-300 rounded-xl p-3 bg-white/80">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-emerald-900">Entities</div>
                            <button
                              onClick={() => copy(s.entities.map((e) => `• ${e}`).join("\n"), `ents-${id}`)}
                              className="text-xs px-3 py-1.5 rounded-full border bg-white/80 border-emerald-300 text-emerald-900 hover:bg-white transition"
                            >
                              {copiedKey === `ents-${id}` ? "Copied!" : "Copy"}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {s.entities.map((e, i) => (
                              <span
                                key={`ent-${i}`}
                                className="text-[11px] bg-teal-100 text-teal-800 px-2 py-1 rounded-full border border-teal-200 cursor-pointer hover:bg-teal-200 transition"
                                onClick={() => copy(e, `ent-${id}-${i}`)}
                                title="Click to copy"
                              >
                                {e}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      {Array.isArray(s.actions) && s.actions.length > 0 && (
                        <div className="border border-emerald-300 rounded-xl p-3 bg-white/80">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-emerald-900">Actions</div>
                            <button
                              onClick={() => copy(s.actions.map((a) => `• ${a}`).join("\n"), `acts-${id}`)}
                              className="text-xs px-3 py-1.5 rounded-full border bg-white/80 border-emerald-300 text-emerald-900 hover:bg-white transition"
                            >
                              {copiedKey === `acts-${id}` ? "Copied!" : "Copy"}
                            </button>
                          </div>
                          <div className="space-y-1">
                            {s.actions.map((a, i) => (
                              <div
                                key={`act-${i}`}
                                className="text-xs text-emerald-900 bg-orange-50 border border-orange-200 rounded-lg p-2 cursor-pointer hover:bg-orange-100 transition"
                                onClick={() => copy(a, `act-${id}-${i}`)}
                                title="Click to copy"
                              >
                                {a}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Insights */}
                      {Array.isArray(s.insights) && s.insights.length > 0 && (
                        <div className="border border-emerald-300 rounded-xl p-3 bg-white/80">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-emerald-900">Insights</div>
                            <button
                              onClick={() => copy(s.insights.map((i) => `• ${i}`).join("\n"), `ins-${id}`)}
                              className="text-xs px-3 py-1.5 rounded-full border bg-white/80 border-emerald-300 text-emerald-900 hover:bg-white transition"
                            >
                              {copiedKey === `ins-${id}` ? "Copied!" : "Copy"}
                            </button>
                          </div>
                          <div className="space-y-1">
                            {s.insights.map((i, ix) => (
                              <div
                                key={`ins-${ix}`}
                                className="text-xs text-emerald-900 bg-purple-50 border border-purple-200 rounded-lg p-2 cursor-pointer hover:bg-purple-100 transition"
                                onClick={() => copy(i, `ins-${id}-${ix}`)}
                                title="Click to copy"
                              >
                                {i}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Suggestions */}
        {Array.isArray(suggestions) && suggestions.length > 0 && (
          <div className="mb-2 bg-gradient-to-r from-indigo-100 to-blue-100 border border-indigo-300 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-indigo-700 rounded-full" />
              <h3 className="text-sm font-semibold text-indigo-900">Suggestions</h3>
              <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                {suggestions.length} available
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions
                .slice()
                .reverse()
                .slice(0, 12)
                .map((c, i) => (
                  <button
                    key={(c.created_at || "") + (c.command || c.slug) + i}
                    onClick={() => {
                      const { addCommand } = useSessionStore.getState();
                      addCommand({ label: c.command || c.slug });
                    }}
                    className="text-xs px-3 py-1.5 rounded-full border bg-white/80 border-indigo-300 text-indigo-900 hover:bg-white active:scale-95 transition font-medium"
                    title={`Send "${c.command || c.slug}"`}
                  >
                    {c.command || c.slug}
                  </button>
                ))}
            </div>
            {suggestions.length > 12 && (
              <div className="text-xs text-indigo-600 mt-2 text-center">
                +{suggestions.length - 12} more suggestions available
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
