// components/RightPanel.jsx — Fixed Live Notes display
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

export default function RightPanel() {
  const [inspector, setInspector] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [authState, setAuthState] = useState({ loading: true, authenticated: false, userId: null });
  const [collapsedIds, setCollapsedIds] = useState(new Set());

  const { activeId, sessions, guestMessageCount } = useSessionStore((s) => ({
    activeId: s.activeId,
    sessions: s.sessions,
    guestMessageCount: s.guestMessageCount,
  }));

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        if (r.ok) {
          const userData = await r.json();
          setAuthState({ 
            loading: false, 
            authenticated: !!userData?.userId,
            userId: userData?.userId || null
          });
        } else {
          setAuthState({ loading: false, authenticated: false, userId: null });
        }
      } catch {
        setAuthState({ loading: false, authenticated: false, userId: null });
      }
    })();
  }, []);

  useEffect(() => {
    setInspector(null);
    setCollapsedIds(new Set());
  }, [authState.authenticated, authState.userId]);

  const currentThread = activeId ? sessions[activeId]?.messages || [] : [];
  const threadUserCount = currentThread.filter((m) => m?.role === "user").length;
  const currentUserMessageCount = authState.authenticated ? threadUserCount : guestMessageCount;

  useEffect(() => {
    const onUpdate = (e) => {
      if (e?.detail) {
        setInspector(e.detail);
      }
    };
    window.addEventListener("inspector:update", onUpdate);
    return () => window.removeEventListener("inspector:update", onUpdate);
  }, []);

  useEffect(() => {
    const onMessageResponse = (e) => {
      if (e?.detail?.inspector) {
        setInspector(e.detail.inspector);
      }
    };
    window.addEventListener("message:response", onMessageResponse);
    return () => window.removeEventListener("message:response", onMessageResponse);
  }, []);

  useEffect(() => {
    if (!activeId || authState.loading) {
      setInspector(null);
      setCollapsedIds(new Set());
      return;
    }
    
    const load = async () => {
      try {
        const r = await fetch(`/api/session?sessionId=${encodeURIComponent(activeId)}`, { 
          cache: "no-store",
          credentials: "include"
        });
        
        const j = await r.json();
        
        if (j?.inspector) {
          setInspector(j.inspector);
        }
      } catch (e) {
        // Silent fail
      }
    };
    
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [activeId, authState.authenticated, authState.userId]);

  const liveHistory = useMemo(() => {
    const history = inspector?.live_history || [];
    return history.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [inspector]);
  
  const liveBadge = liveHistory.length;
  const commands = inspector?.commands || [];

  const getId = (e) => `${e.created_at}|${e.from_turn}|${e.to_turn}`;
  
  useEffect(() => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      for (const e of liveHistory) {
        const id = getId(e);
        if (!next.has(id)) next.add(id);
      }
      for (const id of Array.from(next)) {
        if (!liveHistory.some((e) => getId(e) === id)) next.delete(id);
      }
      return next;
    });
  }, [liveHistory.map(getId).join("|")]);

  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1200);
    } catch (e) {
      // Silent fail
    }
  }

  function buildSnapshotCopy(snapshot) {
    const sections = [];
    
    if (snapshot.gist) {
      sections.push(`SUMMARY\n${snapshot.gist}`);
    }
    
    if (snapshot.key_points?.length) {
      sections.push(`KEY POINTS\n${snapshot.key_points.map(p => `• ${p}`).join('\n')}`);
    }
    
    if (snapshot.entities?.length) {
      sections.push(`ENTITIES\n${snapshot.entities.map(e => `• ${e}`).join('\n')}`);
    }
    
    if (snapshot.actions?.length) {
      sections.push(`ACTIONS\n${snapshot.actions.map(a => `• ${a}`).join('\n')}`);
    }
    
    if (snapshot.insights?.length) {
      sections.push(`INSIGHTS\n${snapshot.insights.map(i => `• ${i}`).join('\n')}`);
    }
    
    return sections.join('\n\n');
  }

  const chipStyle = "text-xs px-3 py-1.5 rounded-full border bg-white/80 border-emerald-300 text-emerald-900 hover:bg-white active:scale-95 transition";

  if (authState.loading) {
    return (
      <aside className="hidden w-80 shrink-0 lg:block px-4 pb-4 pt-0">
        <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-300 rounded-3xl p-5 h-full max-h-screen overflow-y-auto shadow-sm">
          <div className="flex items-center justify-center h-32">
            <div className="text-sm text-slate-600">Loading...</div>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden w-80 shrink-0 lg:block px-4 pb-4 pt-0">
      <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-300 rounded-3xl p-5 h-full max-h-screen overflow-y-auto shadow-sm">
        
        <div className="mb-4 pb-3 border-b border-slate-200">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-slate-900">Session Insights</h2>
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${authState.authenticated ? "bg-emerald-600" : "bg-amber-600"}`} />
              <span className="text-xs text-slate-700">
                {authState.authenticated ? "Verified" : "Guest"}
              </span>
            </div>
          </div>
          <div className="text-xs text-slate-600">
            Session Messages: {currentUserMessageCount}
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-emerald-900">Live Notes</h3>
            <div
              className={`min-w-6 h-6 px-2 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                liveBadge > 0 ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"
              }`}
              title="Snapshots every 5 user turns"
            >
              {liveBadge}
            </div>
          </div>

          {!authState.authenticated && (
            <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-300 rounded-2xl p-4 text-xs text-amber-900 mb-3">
              Live Notes are only available for authenticated users. Sign in to see rich conversation insights.
            </div>
          )}

          {authState.authenticated && liveBadge === 0 && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-300 rounded-2xl p-4 text-xs text-emerald-900">
              First Live Notes snapshot appears at turn 5. Rich context including summaries, entities, actions, and insights.
            </div>
          )}

          {authState.authenticated && liveBadge > 0 && (
            <div className="space-y-3">
              {liveHistory.map((snapshot) => {
                const id = getId(snapshot);
                const isCollapsed = collapsedIds.has(id);
                const fullCopy = buildSnapshotCopy(snapshot);

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
                        Turns {snapshot.from_turn}—{snapshot.to_turn} • {new Date(snapshot.created_at).toLocaleDateString()}
                      </button>

                      <button onClick={() => copy(fullCopy, `snapshot-all-${id}`)} className={chipStyle}>
                        {copiedKey === `snapshot-all-${id}` ? "Copied!" : "Copy All"}
                      </button>
                    </div>

                    {isCollapsed ? (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => copy(snapshot.gist || "", `summary-${id}`)}
                          className="flex items-center justify-between text-xs bg-emerald-200 hover:bg-emerald-300 border border-emerald-400 rounded-xl px-3 py-2 transition"
                          title="Copy Summary"
                        >
                          <span className="font-semibold text-emerald-950">Summary</span>
                          <span className="text-emerald-950">{copiedKey === `summary-${id}` ? "✓" : (snapshot.gist ? "1" : "0")}</span>
                        </button>
                        
                        <button
                          onClick={() => copy((snapshot.key_points || []).map(p => `• ${p}`).join("\n"), `keypoints-${id}`)}
                          className="flex items-center justify-between text-xs bg-emerald-200 hover:bg-emerald-300 border border-emerald-400 rounded-xl px-3 py-2 transition"
                          title="Copy Key Points"
                        >
                          <span className="font-semibold text-emerald-950">Points</span>
                          <span className="text-emerald-950">{copiedKey === `keypoints-${id}` ? "✓" : (snapshot.key_points?.length || 0)}</span>
                        </button>
                        
                        <button
                          onClick={() => copy((snapshot.entities || []).map(e => `• ${e}`).join("\n"), `entities-${id}`)}
                          className="flex items-center justify-between text-xs bg-emerald-200 hover:bg-emerald-300 border border-emerald-400 rounded-xl px-3 py-2 transition"
                          title="Copy Entities"
                        >
                          <span className="font-semibold text-emerald-950">Entities</span>
                          <span className="text-emerald-950">{copiedKey === `entities-${id}` ? "✓" : (snapshot.entities?.length || 0)}</span>
                        </button>
                        
                        <button
                          onClick={() => copy((snapshot.actions || []).map(a => `• ${a}`).join("\n"), `actions-${id}`)}
                          className="flex items-center justify-between text-xs bg-emerald-200 hover:bg-emerald-300 border border-emerald-400 rounded-xl px-3 py-2 transition"
                          title="Copy Actions"
                        >
                          <span className="font-semibold text-emerald-950">Actions</span>
                          <span className="text-emerald-950">{copiedKey === `actions-${id}` ? "✓" : (snapshot.actions?.length || 0)}</span>
                        </button>
                        
                        <button
                          onClick={() => copy((snapshot.insights || []).map(i => `• ${i}`).join("\n"), `insights-${id}`)}
                          className="flex items-center justify-between text-xs bg-emerald-200 hover:bg-emerald-300 border border-emerald-400 rounded-xl px-3 py-2 transition"
                          title="Copy Insights"
                        >
                          <span className="font-semibold text-emerald-950">Insights</span>
                          <span className="text-emerald-950">{copiedKey === `insights-${id}` ? "✓" : (snapshot.insights?.length || 0)}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3 mt-1">
                        
                        {snapshot.gist && (
                          <div className="border border-emerald-300 rounded-xl p-3 bg-white/80">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-semibold text-emerald-900 flex items-center gap-1">
                                <span>Summary</span>
                              </div>
                              <button onClick={() => copy(snapshot.gist, `summary-${id}`)} className={chipStyle}>
                                {copiedKey === `summary-${id}` ? "Copied!" : "Copy"}
                              </button>
                            </div>
                            <div className="text-xs text-emerald-900 whitespace-pre-wrap leading-relaxed">{snapshot.gist}</div>
                          </div>
                        )}

                        {Array.isArray(snapshot.key_points) && snapshot.key_points.length > 0 && (
                          <div className="border border-emerald-300 rounded-xl p-3 bg-white/80">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-semibold text-emerald-900 flex items-center gap-1">
                                <span>Key Points</span>
                              </div>
                              <button
                                onClick={() => copy(snapshot.key_points.map(p => `• ${p}`).join("\n"), `keypoints-${id}`)}
                                className={chipStyle}
                              >
                                {copiedKey === `keypoints-${id}` ? "Copied!" : "Copy"}
                              </button>
                            </div>
                            <div className="space-y-1">
                              {snapshot.key_points.map((point, i) => (
                                <div
                                  key={`kp-${i}`}
                                  className="text-xs text-emerald-900 bg-white/70 border border-emerald-200 rounded-lg p-2 cursor-pointer hover:bg-white/90 transition"
                                  onClick={() => copy(point, `kp-${id}-${i}`)}
                                  title="Click to copy this point"
                                >
                                  • {point}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {Array.isArray(snapshot.entities) && snapshot.entities.length > 0 && (
                          <div className="border border-emerald-300 rounded-xl p-3 bg-white/80">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-semibold text-emerald-900 flex items-center gap-1">
                                <span>Entities</span>
                              </div>
                              <button
                                onClick={() => copy(snapshot.entities.map(e => `• ${e}`).join("\n"), `entities-${id}`)}
                                className={chipStyle}
                              >
                                {copiedKey === `entities-${id}` ? "Copied!" : "Copy"}
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {snapshot.entities.map((entity, i) => (
                                <span
                                  key={`entity-${i}`}
                                  className="text-xs bg-teal-100 text-teal-800 px-2 py-1 rounded-full border border-teal-200 cursor-pointer hover:bg-teal-200 transition"
                                  onClick={() => copy(entity, `entity-${id}-${i}`)}
                                  title="Click to copy this entity"
                                >
                                  {entity}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {Array.isArray(snapshot.actions) && snapshot.actions.length > 0 && (
                          <div className="border border-emerald-300 rounded-xl p-3 bg-white/80">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-semibold text-emerald-900 flex items-center gap-1">
                                <span>Actions</span>
                              </div>
                              <button
                                onClick={() => copy(snapshot.actions.map(a => `• ${a}`).join("\n"), `actions-${id}`)}
                                className={chipStyle}
                              >
                                {copiedKey === `actions-${id}` ? "Copied!" : "Copy"}
                              </button>
                            </div>
                            <div className="space-y-1">
                              {snapshot.actions.map((action, i) => (
                                <div
                                  key={`action-${i}`}
                                  className="text-xs text-emerald-900 bg-orange-50 border border-orange-200 rounded-lg p-2 cursor-pointer hover:bg-orange-100 transition"
                                  onClick={() => copy(action, `action-${id}-${i}`)}
                                  title="Click to copy this action"
                                >
                                  {action}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {Array.isArray(snapshot.insights) && snapshot.insights.length > 0 && (
                          <div className="border border-emerald-300 rounded-xl p-3 bg-white/80">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-semibold text-emerald-900 flex items-center gap-1">
                                <span>Insights</span>
                              </div>
                              <button
                                onClick={() => copy(snapshot.insights.map(i => `• ${i}`).join("\n"), `insights-${id}`)}
                                className={chipStyle}
                              >
                                {copiedKey === `insights-${id}` ? "Copied!" : "Copy"}
                              </button>
                            </div>
                            <div className="space-y-1">
                              {snapshot.insights.map((insight, i) => (
                                <div
                                  key={`insight-${i}`}
                                  className="text-xs text-emerald-900 bg-purple-50 border border-purple-200 rounded-lg p-2 cursor-pointer hover:bg-purple-100 transition"
                                  onClick={() => copy(insight, `insight-${id}-${i}`)}
                                  title="Click to copy this insight"
                                >
                                  {insight}
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

        {commands.length > 0 && (
          <div className="mb-2 bg-gradient-to-r from-indigo-100 to-blue-100 border border-indigo-300 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-indigo-700 rounded-full" />
              <h3 className="text-sm font-semibold text-indigo-900">Suggestions</h3>
              <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                {commands.length} available
              </span>
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
                    className="text-xs px-3 py-1.5 rounded-full border bg-white/80 border-indigo-300 text-indigo-900 hover:bg-white active:scale-95 transition font-medium"
                    title={`Send "${c.command || c.slug}"`}
                  >
                    {c.command || c.slug}
                  </button>
                ))}
            </div>
            {commands.length > 12 && (
              <div className="text-xs text-indigo-600 mt-2 text-center">
                +{commands.length - 12} more suggestions available
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}