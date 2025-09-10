// components/RightPanel.jsx — Live Notes cards (history), collapsible with Copy, green counter, + Commands (4x rule). No snapshots.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

export default function RightPanel() {
  const [inspector, setInspector] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [authState, setAuthState] = useState({ loading: true, authenticated: false });
  const [collapsedIds, setCollapsedIds] = useState(new Set()); // snapshot-like per LiveNote card

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

  // message counts (for badge)
  const currentThread = activeId ? sessions[activeId]?.messages || [] : [];
  const threadUserCount = currentThread.filter((m) => m?.role === "user").length;
  const currentUserMessageCount = authState.authenticated ? threadUserCount : guestMessageCount;

  // push updates
  useEffect(() => {
    const onUpdate = (e) => e?.detail && setInspector(e.detail);
    window.addEventListener("inspector:update", onUpdate);
    return () => window.removeEventListener("inspector:update", onUpdate);
  }, []);

  // polling
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
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [activeId]);

  const liveHistory = useMemo(() => (inspector?.live_history || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), [inspector]);
  const liveBadge = liveHistory.length;
  const commands = inspector?.commands || [];

  // maintain collapsed state by id
  const getId = (e) => `${e.created_at}|${e.from_turn}|${e.to_turn}`;
  useEffect(() => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      for (const e of liveHistory) {
        const id = getId(e);
        if (!next.has(id)) next.add(id); // default collapsed when first seen (like “pop in”)
      }
      // prune stale
      for (const id of Array.from(next)) {
        if (!liveHistory.some((e) => getId(e) === id)) next.delete(id);
      }
      return next;
    });
  }, [liveHistory.map(getId).join("|")]);

  // copy helper
  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 900);
    } catch {}
  }

  const chip = "text-xs px-3 py-1.5 rounded-full border bg-white/80 border-emerald-300 text-emerald-900 hover:bg-white active:scale-95 transition";

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
          <div className="text-xs text-slate-600">Messages: {currentUserMessageCount}</div>
        </div>

        {/* LIVE NOTES LIST */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-emerald-900">Live Notes</h3>
            <div
              className={`min-w-6 h-6 px-2 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                liveBadge > 0 ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"
              }`}
              title="Updates every 5 user turns"
            >
              {liveBadge}
            </div>
          </div>

          {liveBadge === 0 && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-300 rounded-2xl p-4 text-xs text-emerald-900">
              First Live Notes card appears at turn 5.
            </div>
          )}

          {liveBadge > 0 && (
            <div className="space-y-3">
              {liveHistory.map((ln) => {
                const id = getId(ln);
                const isCollapsed = collapsedIds.has(id);
                const copyAll = [
                  ln.gist ? `Summary:\n• ${ln.gist}` : "",
                  ...(ln.key_points?.length ? ["\nKey Points:", ...ln.key_points.map((p) => `• ${p}`)] : []),
                ]
                  .filter(Boolean)
                  .join("\n");

                return (
                  <div key={id} className="bg-gradient-to-r from-emerald-100 to-teal-100 border border-emerald-300 rounded-2xl p-4 shadow-sm">
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
                        className="flex items-center gap-2 text-xs text-emerald-900 hover:text-emerald-950 font-semibold"
                      >
                        <svg className={`w-3 h-3 transition-transform ${isCollapsed ? "" : "rotate-90"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        Turns {ln.from_turn}—{ln.to_turn} • {new Date(ln.created_at).toLocaleDateString()}
                      </button>

                      <button onClick={() => copy(copyAll, `ln-all-${id}`)} className={chip}>
                        {copiedKey === `ln-all-${id}` ? "Copied!" : "Copy All"}
                      </button>
                    </div>

                    {isCollapsed ? (
                      <div className="space-y-2">
                        <button
                          onClick={() => copy(ln.gist || "", `ln-gist-${id}`)}
                          className="w-full flex items-center justify-between text-xs bg-emerald-200 hover:bg-emerald-300 border border-emerald-400 rounded-xl px-3 py-2 transition"
                          title="Copy Summary"
                        >
                          <span className="font-semibold text-emerald-950">Summary</span>
                          <span className="text-emerald-950">{copiedKey === `ln-gist-${id}` ? "✓" : (ln.gist ? 1 : 0)}</span>
                        </button>
                        <button
                          onClick={() => copy((ln.key_points || []).map((p) => `• ${p}`).join("\n"), `ln-kp-${id}`)}
                          className="w-full flex items-center justify-between text-xs bg-emerald-200 hover:bg-emerald-300 border border-emerald-400 rounded-xl px-3 py-2 transition"
                          title="Copy Key Points"
                        >
                          <span className="font-semibold text-emerald-950">Key Points</span>
                          <span className="text-emerald-950">{copiedKey === `ln-kp-${id}` ? "✓" : (ln.key_points?.length || 0)}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3 mt-1">
                        {/* Summary */}
                        {ln.gist && (
                          <div className="border border-emerald-300 rounded-xl p-3 bg-white/80">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-semibold text-emerald-900">Summary</div>
                              <button onClick={() => copy(ln.gist, `ln-gist-${id}`)} className={chip}>
                                {copiedKey === `ln-gist-${id}` ? "Copied!" : "Copy"}
                              </button>
                            </div>
                            <div className="text-xs text-emerald-900 whitespace-pre-wrap">{ln.gist}</div>
                          </div>
                        )}

                        {/* Key Points */}
                        {Array.isArray(ln.key_points) && ln.key_points.length > 0 && (
                          <div className="border border-emerald-300 rounded-xl p-3 bg-white/80">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-semibold text-emerald-900">Key Points</div>
                              <button
                                onClick={() => copy(ln.key_points.map((p) => `• ${p}`).join("\n"), `ln-kp-${id}`)}
                                className={chip}
                              >
                                {copiedKey === `ln-kp-${id}` ? "Copied!" : "Copy"}
                              </button>
                            </div>
                            <div className="space-y-1">
                              {ln.key_points.map((p, i) => (
                                <div
                                  key={`kp-${i}`}
                                  className="text-xs text-emerald-900 bg-white/70 border border-emerald-200 rounded-lg p-2"
                                  onClick={() => copy(p, `ln-kp-${id}-${i}`)}
                                  title="Click to copy"
                                >
                                  {p}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* COMMANDS */}
        {commands.length > 0 && (
          <div className="mb-2 bg-gradient-to-r from-indigo-100 to-blue-100 border border-indigo-300 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-indigo-700 rounded-full" />
              <h3 className="text-sm font-semibold text-indigo-900">Suggestions</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {commands
                .slice()
                .reverse()
                .slice(0, 12)
                .map((c, i) => (
                  <button
                    key={(c.created_at || "") + c.command + i}
                    onClick={() => {
                      const { addCommand } = useSessionStore.getState();
                      addCommand({ label: c.command || c.slug });
                    }}
                    className="text-xs px-3 py-1.5 rounded-full border bg-white/80 border-indigo-300 text-indigo-900 hover:bg-white active:scale-95 transition"
                    title={`Send "${c.command || c.slug}"`}
                  >
                    {c.command || c.slug}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
