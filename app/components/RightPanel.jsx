// components/RightPanel.jsx - darker bubbles, collapsed snapshot info by default, Copy on all sections incl. Live Notes
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

export default function RightPanel() {
  const [inspector, setInspector] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [authState, setAuthState] = useState({ loading: true, authenticated: false });
  const [collapsed, setCollapsed] = useState(new Set()); // collapsed snapshot indices

  const { activeId, sessions, guestMessageCount } = useSessionStore((s) => ({
    activeId: s.activeId,
    sessions: s.sessions,
    guestMessageCount: s.guestMessageCount,
  }));

  // auth state
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        const ok = r.ok ? (await r.json())?.userId : null;
        setAuthState({ loading: false, authenticated: !!ok });
      } catch {
        setAuthState({ loading: false, authenticated: false });
      }
    })();
  }, []);

  // current counts
  const currentThread = activeId ? sessions[activeId]?.messages || [] : [];
  const threadUserCnt = currentThread.filter((m) => m?.role === "user").length;
  const currentUserMessageCount = authState.authenticated ? threadUserCnt : guestMessageCount;

  // subscribe to push updates
  useEffect(() => {
    const onUpdate = (e) => e?.detail && setInspector(e.detail);
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

  // collapse all snapshots by default
  useEffect(() => {
    const snaps = inspector?.snapshots || [];
    const next = new Set();
    for (let i = 0; i < snaps.length; i++) next.add(i);
    setCollapsed(next);
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

  // inspector fields
  const snapshots = inspector?.snapshots || [];
  const commands = inspector?.commands || [];
  const live = inspector?.live || {};
  const remainder = currentUserMessageCount % 5;
  const toNextSnapshot = remainder === 0 ? 0 : 5 - remainder;

  const buildSectionCopy = (s, key) => {
    if (!s) return "";
    switch (key) {
      case "topics":
        return (s.topics || []).map((t) => `• ${t.slug}${t.gloss ? ` — ${t.gloss}` : ""}`).join("\n");
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

  const latest = useMemo(() => snapshots.at(-1) || null, [snapshots]);
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

  // darker chip classes
  const chipBase =
    "text-xs px-3 py-1.5 rounded-full border transition-all duration-150 active:scale-95";
  const chipStrong =
    "bg-slate-200 border-slate-300 text-slate-800 hover:bg-slate-300 hover:border-slate-400";

  return (
    <aside className="hidden w-80 shrink-0 lg:block px-4 pb-4 pt-0">
      <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-3xl p-5 h-full max-h-screen overflow-y-auto shadow-sm">

        {/* Header */}
        <div className="mb-4 pb-3 border-b border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-900">Session Insights</h2>
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${authState.authenticated ? "bg-emerald-500" : "bg-amber-500"}`} />
              <span className="text-xs text-slate-600">{authState.authenticated ? "Verified" : "Guest"}</span>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Messages: {currentUserMessageCount} • Snapshots: {snapshots.length}
          </div>
        </div>

        {/* Live notes (copyable fields) */}
        {authState.authenticated && live && Object.keys(live).length > 0 && (
          <div className="mb-4 bg-gradient-to-r from-emerald-100 to-teal-100 border border-emerald-300 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-600 rounded-full" />
                <h3 className="text-sm font-semibold text-emerald-800">Live Notes</h3>
              </div>
              {/* Copy both sections at once */}
              <button
                onClick={() => {
                  const s = [
                    live.gist ? `Summary:\n• ${live.gist}` : "",
                    ...(live.key_points?.length
                      ? ["\nKey Points:", ...live.key_points.map((p) => `• ${p}`)]
                      : []),
                  ]
                    .filter(Boolean)
                    .join("\n");
                  copy(s, "live-all");
                }}
                className={`${chipBase} ${chipStrong}`}
              >
                {copiedKey === "live-all" ? "Copied!" : "Copy All"}
              </button>
            </div>

            {live.gist && (
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-emerald-900 mb-1">Summary</div>
                  <button
                    onClick={() => copy(live.gist, "live-gist")}
                    className={`${chipBase} ${chipStrong}`}
                  >
                    {copiedKey === "live-gist" ? "Copied!" : "Copy"}
                  </button>
                </div>
                <div
                  className="text-xs text-emerald-900 leading-relaxed bg-white/70 border border-emerald-300 rounded-lg p-2"
                  title="Click to copy"
                  onClick={() => copy(live.gist, "live-gist")}
                >
                  {live.gist}
                </div>
              </div>
            )}

            {live.key_points?.length > 0 && (
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-emerald-900 mb-1">Key Points</div>
                  <button
                    onClick={() => copy(live.key_points.map((p) => `• ${p}`).join("\n"), "live-kp")}
                    className={`${chipBase} ${chipStrong}`}
                  >
                    {copiedKey === "live-kp" ? "Copied!" : "Copy"}
                  </button>
                </div>
                <div className="space-y-1">
                  {live.key_points.map((p, i) => {
                    const k = `live-kp-${i}`;
                    return (
                      <div
                        key={k}
                        className="text-xs text-emerald-900 bg-white/70 border border-emerald-300 rounded-lg p-2"
                        title="Click to copy"
                        onClick={() => copy(p, k)}
                      >
                        {p}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Suggestions (darker chips) */}
        {commands.length > 0 && (
          <div className="mb-4 bg-gradient-to-r from-indigo-100 to-blue-100 border border-indigo-300 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-indigo-600 rounded-full" />
              <h3 className="text-sm font-semibold text-indigo-900">Suggestions</h3>
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
                      setCopiedKey(`cmd-${i}`);
                      setTimeout(() => setCopiedKey(null), 900);
                    }}
                    className={`${chipBase} ${chipStrong}`}
                    title={`Send "${c.command || c.slug}"`}
                  >
                    {c.command || c.slug} {copiedKey === `cmd-${i}` ? "✓" : ""}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Snapshots */}
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Conversation Snapshots</h3>

          {!authState.authenticated && (
            <div className="bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-300 rounded-2xl p-4 text-center">
              <p className="text-xs text-amber-900">
                Sign in to receive automatic summaries every 5 messages.
              </p>
            </div>
          )}

          {authState.authenticated && snapshots.length === 0 && (
            <div className="bg-gradient-to-r from-slate-100 to-gray-100 border border-slate-300 rounded-2xl p-4 text-center">
              <p className="text-xs text-slate-700 font-medium">First snapshot arrives at turn 5.</p>
              <p className="text-xs text-slate-600">({toNextSnapshot} more message{toNextSnapshot === 1 ? "" : "s"})</p>
            </div>
          )}

          {snapshots.length > 0 && (
            <div className="space-y-3">
              {snapshots
                .slice()
                .reverse()
                .map((snap, i) => {
                  const idx = i;
                  const isCollapsed = collapsed.has(idx);
                  const fields = sectionMeta(snap);

                  return (
                    <div key={(snap.created_at || "") + i} className="bg-white border border-slate-300 rounded-2xl p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <button
                          onClick={() => {
                            const next = new Set(collapsed);
                            if (next.has(idx)) next.delete(idx);
                            else next.add(idx);
                            setCollapsed(next);
                          }}
                          className="flex items-center gap-2 text-xs text-slate-700 hover:text-slate-900 font-medium"
                        >
                          <svg
                            className={`w-3 h-3 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          Turns {snap.from_turn ?? "?"}—{snap.to_turn ?? "?"} • {new Date(snap.created_at).toLocaleDateString()}
                        </button>

                        <button
                          onClick={() => {
                            const all = ["topics", "key_details", "decisions", "open_questions", "actions"]
                              .map((k) => buildSectionCopy(snap, k))
                              .filter(Boolean)
                              .join("\n\n");
                            copy(all, `snap-all-${i}`);
                          }}
                          className={`${chipBase} ${chipStrong}`}
                        >
                          {copiedKey === `snap-all-${i}` ? "Copied!" : "Copy All"}
                        </button>
                      </div>

                      {/* Collapsed: show darker “bubbles” rows with counts + copy */}
                      {isCollapsed && (
                        <div className="space-y-2">
                          {fields.map((f) => {
                            const key = `${f.key}-${i}`;
                            const text = buildSectionCopy(snap, f.key);
                            return (
                              <div key={key} className="flex items-center">
                                <button
                                  onClick={() => copy(text, key)}
                                  className="flex-1 flex items-center justify-between text-xs bg-slate-200 hover:bg-slate-300 border border-slate-400 rounded-xl px-3 py-2 transition-colors"
                                  title="Copy section"
                                >
                                  <span className="font-semibold text-slate-900">{f.label}</span>
                                  <span className="text-slate-800">{copiedKey === key ? "✓" : f.count}</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Expanded: full lists with per-section Copy */}
                      {!isCollapsed && (
                        <div className="space-y-3 mt-2">
                          {fields.map((f) => {
                            const key = `${f.key}-${i}`;
                            const text = buildSectionCopy(snap, f.key);
                            return (
                              <div key={key} className="border border-slate-300 rounded-xl p-3 bg-slate-50">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-xs font-semibold text-slate-900">
                                    {f.label} {f.count ? `(${f.count})` : ""}
                                  </h4>
                                  <button
                                    onClick={() => copy(text, key)}
                                    className={`${chipBase} ${chipStrong}`}
                                  >
                                    {copiedKey === key ? "Copied!" : "Copy"}
                                  </button>
                                </div>
                                {text ? (
                                  <pre className="text-[11px] text-slate-800 leading-relaxed whitespace-pre-wrap">{text}</pre>
                                ) : (
                                  <div className="text-[11px] text-slate-500">No items</div>
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
