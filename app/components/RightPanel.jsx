// components/RightPanel.jsx — smart green bubble (every 5 turns), stable collapsible snapshots, darker bubbles, copy everywhere
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

export default function RightPanel() {
  const [inspector, setInspector] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [authState, setAuthState] = useState({ loading: true, authenticated: false });
  const [collapsedIds, setCollapsedIds] = useState(new Set()); // snapshotId -> collapsed

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
        setAuthState({ loading: false, authenticated: !!(r.ok && (await r.json())?.userId) });
      } catch {
        setAuthState({ loading: false, authenticated: false });
      }
    })();
  }, []);

  // counts
  const currentThread = activeId ? sessions[activeId]?.messages || [] : [];
  const threadUserCount = currentThread.filter((m) => m?.role === "user").length;
  const currentUserMessageCount = authState.authenticated ? threadUserCount : guestMessageCount;

  // inspector push + polling
  useEffect(() => {
    const onUpdate = (e) => e?.detail && setInspector(e.detail);
    window.addEventListener("inspector:update", onUpdate);
    return () => window.removeEventListener("inspector:update", onUpdate);
  }, []);

  useEffect(() => {
    if (!activeId) {
      setInspector(null);
      setCollapsedIds(new Set());
      return;
    }
    const load = async () => {
      try {
        const r = await fetch(`/api/session?sessionId=${encodeURIComponent(activeId)}`, { cache: "no-store" });
        const j = await r.json();
        if (j?.inspector) setInspector(j.inspector);
      } catch {}
    };
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [activeId]);

  // snapshots + stable IDs
  const snapshots = inspector?.snapshots || [];
  const createId = (s) => `${s.created_at}|${s.from_turn}|${s.to_turn}`;

  // keep collapse state; new ones default collapsed
  useEffect(() => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      for (const s of snapshots) {
        const id = createId(s);
        if (!next.has(id)) next.add(id);
      }
      // also prune IDs that no longer exist
      for (const id of Array.from(next)) {
        if (!snapshots.some((s) => createId(s) === id)) next.delete(id);
      }
      return next;
    });
  }, [snapshots.map((s) => createId(s)).join("|")]); // stable dependency

  const live = inspector?.live || {};
  const commands = inspector?.commands || [];
  const remainder = currentUserMessageCount % 5;
  const expectedSnapshotCount = Math.floor(currentUserMessageCount / 5); // smart green bubble value

  // copy helper
  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1000);
    } catch {}
  }

  // section helpers
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

  // UI tokens
  const chip = "text-xs px-3 py-1.5 rounded-full border bg-slate-200 border-slate-300 text-slate-900 hover:bg-slate-300 active:scale-95 transition";

  return (
    <aside className="hidden w-80 shrink-0 lg:block px-4 pb-4 pt-0">
      <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-300 rounded-3xl p-5 h-full max-h-screen overflow-y-auto shadow-sm">
        {/* Header */}
        <div className="mb-4 pb-3 border-b border-slate-300">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-slate-900">Session Insights</h2>
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${authState.authenticated ? "bg-emerald-600" : "bg-amber-600"}`} />
              <span className="text-xs text-slate-700">{authState.authenticated ? "Verified" : "Guest"}</span>
            </div>
          </div>
          <div className="text-xs text-slate-600">
            Messages: {currentUserMessageCount} • Snapshots: {(snapshots || []).length}
          </div>
        </div>

        {/* Live Notes */}
        {authState.authenticated && (live.gist || (live.key_points && live.key_points.length > 0)) && (
          <div className="mb-4 bg-gradient-to-r from-emerald-100 to-teal-100 border border-emerald-300 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-700 rounded-full" />
                <h3 className="text-sm font-semibold text-emerald-900">Live Notes</h3>
              </div>
              <button
                onClick={() => {
                  const s = [
                    live.gist ? `Summary:\n• ${live.gist}` : "",
                    ...(live.key_points?.length ? ["\nKey Points:", ...live.key_points.map((p) => `• ${p}`)] : []),
                  ]
                    .filter(Boolean)
                    .join("\n");
                  copy(s, "live-all");
                }}
                className={chip}
              >
                {copiedKey === "live-all" ? "Copied!" : "Copy All"}
              </button>
            </div>

            {live.gist && (
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-emerald-900 mb-1">Summary</div>
                  <button onClick={() => copy(live.gist, "live-gist")} className={chip}>
                    {copiedKey === "live-gist" ? "Copied!" : "Copy"}
                  </button>
                </div>
                <div className="text-xs text-emerald-900 bg-white/80 border border-emerald-300 rounded-lg p-2" onClick={() => copy(live.gist, "live-gist")} title="Click to copy">
                  {live.gist}
                </div>
              </div>
            )}

            {live.key_points?.length > 0 && (
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-emerald-900 mb-1">Key Points</div>
                  <button onClick={() => copy(live.key_points.map((p) => `• ${p}`).join("\n"), "live-kp")} className={chip}>
                    {copiedKey === "live-kp" ? "Copied!" : "Copy"}
                  </button>
                </div>
                <div className="space-y-1">
                  {live.key_points.map((p, i) => (
                    <div key={`kp-${i}`} className="text-xs text-emerald-900 bg-white/80 border border-emerald-300 rounded-lg p-2" onClick={() => copy(p, `kp-${i}`)} title="Click to copy">
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Suggestions */}
        {commands.length > 0 && (
          <div className="mb-4 bg-gradient-to-r from-indigo-100 to-blue-100 border border-indigo-300 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-indigo-700 rounded-full" />
              <h3 className="text-sm font-semibold text-indigo-900">Suggestions</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {commands
                .slice()
                .reverse()
                .slice(0, 8)
                .map((c, i) => (
                  <button
                    key={(c.created_at || "") + c.command + i}
                    onClick={() => {
                      const { addCommand } = useSessionStore.getState();
                      addCommand({ label: c.command || c.slug });
                      setCopiedKey(`cmd-${i}`);
                      setTimeout(() => setCopiedKey(null), 800);
                    }}
                    className={chip}
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
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Conversation Snapshots</h3>
            {/* Smart green bubble: increments every 5 turns (floor(userTurns/5)) */}
            <div
              className={`min-w-6 h-6 px-2 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                expectedSnapshotCount > 0 ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"
              }`}
              title="Snapshots expected based on message count"
            >
              {expectedSnapshotCount}
            </div>
          </div>

          {!authState.authenticated && (
            <div className="bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-300 rounded-2xl p-4 text-center text-xs text-amber-900">
              Sign in to receive automatic summaries every 5 messages.
            </div>
          )}

          {authState.authenticated && snapshots.length === 0 && (
            <div className="bg-gradient-to-r from-slate-100 to-gray-100 border border-slate-300 rounded-2xl p-4 text-center">
              <p className="text-xs text-slate-800 font-medium">First snapshot arrives at turn 5.</p>
              <p className="text-xs text-slate-700">
                ({5 - (currentUserMessageCount % 5 || 5)} more message{(currentUserMessageCount % 5 || 5) === 1 ? "" : "s"})
              </p>
            </div>
          )}

          {snapshots.length > 0 && (
            <div className="space-y-3">
              {snapshots
                .slice()
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) // newest first
                .map((snap) => {
                  const id = createId(snap);
                  const isCollapsed = collapsedIds.has(id);
                  const fields = sectionMeta(snap);

                  return (
                    <div key={id} className="bg-white border border-slate-300 rounded-2xl p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <button
                          onClick={() =>
                            setCollapsedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(id)) next.delete(id);
                              else next.add(id);
                              return next;
                            })
                          }
                          className="flex items-center gap-2 text-xs text-slate-800 hover:text-slate-900 font-medium"
                        >
                          <svg className={`w-3 h-3 transition-transform ${isCollapsed ? "" : "rotate-90"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                            copy(all, `copy-all-${id}`);
                          }}
                          className={chip}
                        >
                          {copiedKey === `copy-all-${id}` ? "Copied!" : "Copy All"}
                        </button>
                      </div>

                      {isCollapsed ? (
                        <div className="space-y-2">
                          {fields.map((f) => {
                            const k = `${id}-${f.key}`;
                            const text = buildSectionCopy(snap, f.key);
                            return (
                              <button
                                key={k}
                                onClick={() => copy(text, k)}
                                className="w-full flex items-center justify-between text-xs bg-slate-200 hover:bg-slate-300 border border-slate-400 rounded-xl px-3 py-2 transition"
                                title="Copy section"
                              >
                                <span className="font-semibold text-slate-900">{f.label}</span>
                                <span className="text-slate-900">{copiedKey === k ? "✓" : f.count}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-3 mt-2">
                          {fields.map((f) => {
                            const k = `${id}-${f.key}`;
                            const text = buildSectionCopy(snap, f.key);
                            return (
                              <div key={k} className="border border-slate-300 rounded-xl p-3 bg-slate-50">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-xs font-semibold text-slate-900">
                                    {f.label} {f.count ? `(${f.count})` : ""}
                                  </h4>
                                  <button onClick={() => copy(text, k)} className={chip}>
                                    {copiedKey === k ? "Copied!" : "Copy"}
                                  </button>
                                </div>
                                {text ? (
                                  <pre className="text-[11px] text-slate-800 leading-relaxed whitespace-pre-wrap">{text}</pre>
                                ) : (
                                  <div className="text-[11px] text-slate-600">No items</div>
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
