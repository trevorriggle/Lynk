// components/RightPanel.jsx — Lynk branded session insights with tier-gated command suggestions
"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

function ChevronDown({ open }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CopyIcon({ className = "w-3.5 h-3.5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function CheckIcon({ className = "w-3.5 h-3.5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="20,6 9,17 4,12" />
    </svg>
  );
}

export default function RightPanel() {
  const [auth, setAuth] = useState({ loading: true, authenticated: false, userId: null });
  const [inspector, setInspector] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [copied, setCopied] = useState("");
  
  // Use refs to prevent state changes from affecting collapsible state
  const [openSnapshots, setOpenSnapshots] = useState({});
  
  // Track which snapshots we've already seen to prevent random auto-opening
  const seenSnapshotsRef = useRef(new Set());
  const lastSnapshotCountRef = useRef(0);

  const { activeId, sessions, guestMessageCount } = useSessionStore((s) => ({
    activeId: s.activeId,
    sessions: s.sessions,
    guestMessageCount: s.guestMessageCount,
  }));

  // Auth bootstrap
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store", credentials: "include" });
        if (cancel) return;
        if (r.ok) {
          const j = await r.json();
          setAuth({ loading: false, authenticated: !!j?.userId, userId: j?.userId || null });
        } else setAuth({ loading: false, authenticated: false, userId: null });
      } catch {
        if (!cancel) setAuth({ loading: false, authenticated: false, userId: null });
      }
    })();
    return () => { cancel = true; };
  }, []);

  // Accept app events
  useEffect(() => {
    const onUpdate = (e) => e?.detail && setInspector(e.detail);
    const onResp = (e) => {
      if (e?.detail?.inspector) setInspector(e.detail.inspector);
      if (e?.detail?.sessionMeta) {
        setSessionData(prev => ({
          ...prev,
          tier: e.detail.sessionMeta.tier
        }));
      }
    };
    window.addEventListener("inspector:update", onUpdate);
    window.addEventListener("message:response", onResp);
    return () => {
      window.removeEventListener("inspector:update", onUpdate);
      window.removeEventListener("message:response", onResp);
    };
  }, []);

  // Polling for session data
  useEffect(() => {
    if (!activeId || auth.loading) {
      setInspector(null);
      setSessionData(null);
      return;
    }
    let cancel = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/session?sessionId=${encodeURIComponent(activeId)}`, {
          cache: "no-store",
          credentials: "include",
        });
        if (!cancel && r.ok) {
          const j = await r.json();
          if (j?.inspector) {
            setInspector(j.inspector);
          }
          if (j?.session) {
            setSessionData(j.session);
          }
        }
      } catch {}
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      cancel = true;
      clearInterval(t);
    };
  }, [activeId, auth.loading]);

  // Reset seen snapshots when switching sessions
  useEffect(() => {
    seenSnapshotsRef.current.clear();
    lastSnapshotCountRef.current = 0;
    setOpenSnapshots({});
  }, [activeId]);

  // Get live history from session store first, fallback to inspector
  const currentSession = activeId ? sessions[activeId] : null;
  const liveHistory = useMemo(() => {
    // Use session store data as primary source
    const sessionHistory = currentSession?.liveHistory || [];
    // Fallback to inspector data if session store is empty
    const inspectorHistory = inspector?.live_history || [];

    const historyAll = sessionHistory.length > 0 ? sessionHistory : inspectorHistory;
    return historyAll
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 4);
  }, [currentSession?.liveHistory, inspector?.live_history]);

  // Auto-open ONLY newly created snapshots (not on first load/refresh)
  useEffect(() => {
    if (liveHistory.length === 0) return;

    const currentCount = liveHistory.length;
    const wasEmpty = lastSnapshotCountRef.current === 0;
    
    // Only auto-open if we have MORE snapshots than before (new snapshot was created)
    if (currentCount > lastSnapshotCountRef.current && !wasEmpty) {
      const newestSnapshot = liveHistory[0];
      const newestId = `${newestSnapshot.created_at}|${newestSnapshot.from_turn}|${newestSnapshot.to_turn}`;
      
      // Only auto-open if we haven't seen this specific snapshot before
      if (!seenSnapshotsRef.current.has(newestId)) {
        setOpenSnapshots(prev => ({
          ...prev,
          [newestId]: true
        }));
        console.log('🎯 Auto-opened new snapshot:', newestId);
      }
    }
    
    // Track all snapshots we've seen
    liveHistory.forEach(snapshot => {
      const id = `${snapshot.created_at}|${snapshot.from_turn}|${snapshot.to_turn}`;
      seenSnapshotsRef.current.add(id);
    });
    
    lastSnapshotCountRef.current = currentCount;
  }, [liveHistory.length]); // Only depend on the count, not the full array

  const commands = inspector?.commands || [];
  const badge = liveHistory.length;
  const userTier = sessionData?.tier || (auth.authenticated ? "FREE_VERIFIED" : "FREE_GUEST");
  const hasCommandsFeature = userTier === "FREE_VERIFIED" || userTier === "PRO";
  const hasSnapshotsFeature = userTier === "FREE_VERIFIED" || userTier === "PRO";

  const currentThread = activeId ? (sessions[activeId]?.messages || []) : [];
  const threadUserCount = currentThread.filter((m) => m?.role === "user").length;
  const sessionMsgCount = auth.authenticated ? threadUserCount : guestMessageCount;

  // Helpers
  const getId = (s) => `${s.created_at}|${s.from_turn}|${s.to_turn}`;
  
  const toggleSnapshot = useCallback((id) => {
    setOpenSnapshots(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  }, []);

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch {}
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  };

  const getTierColor = (tier) => {
    switch(tier) {
      case "FREE_GUEST":
        return "bg-slate-500";
      case "FREE_VERIFIED":
        return "bg-emerald-500";
      case "PRO":
        return "bg-gradient-to-r from-teal-500 to-cyan-500";
      default:
        return "bg-slate-500";
    }
  };

  const getTierLabel = (tier) => {
    switch(tier) {
      case "FREE_GUEST":
        return "Guest";
      case "FREE_VERIFIED":
        return "Verified";
      case "PRO":
        return "Pro";
      default:
        return "Guest";
    }
  };

  // Render loading state
  if (auth.loading) {
    return (
      <aside className="hidden w-80 shrink-0 lg:block px-3 pb-3 pt-0">
        <div className="border border-slate-200 rounded-2xl p-4 h-full max-h-screen overflow-y-auto bg-white">
          <div className="h-24 flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600"></div>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden w-80 shrink-0 lg:block px-3 pb-3 pt-0" aria-label="Session Insights">
      <div className="border border-slate-200 rounded-2xl p-4 h-full max-h-screen overflow-y-auto bg-white shadow-sm">
        {/* Header */}
        <div className="mb-4 pb-3 border-b border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-900">Session Insights</h2>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${getTierColor(userTier)}`} />
              <span className="text-xs text-slate-600 font-medium">
                {getTierLabel(userTier)}
              </span>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Session Messages: <span className="font-medium text-slate-700">{sessionMsgCount}</span>
          </div>
        </div>

        {/* Live Notes Section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Live Notes</h3>
            <span
              className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                badge > 0 
                  ? "bg-gradient-to-r from-teal-50 to-cyan-50 text-teal-700 border-teal-200" 
                  : "bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              {badge} {badge === 1 ? "Snapshot" : "Snapshots"}
            </span>
          </div>

          {/* Guest State */}
          {!hasSnapshotsFeature && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center mt-0.5">
                  <svg className="w-3 h-3 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-amber-800 mb-1">Sign in to unlock Live Notes</p>
                  <p className="text-xs text-amber-700">
                    Get 2 conversation summaries per month with email verification, or unlimited with Pro.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Empty State for Authenticated Users */}
          {hasSnapshotsFeature && badge === 0 && (
            <div className="bg-gradient-to-br from-slate-50 to-gray-50 border border-slate-200 rounded-xl p-4">
              <div className="text-center">
                <div className="w-12 h-12 bg-gradient-to-br from-teal-100 to-cyan-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-700 mb-1">No snapshots yet</p>
                <p className="text-xs text-slate-500">
                  {userTier === "PRO"
                    ? "Conversation summaries will appear automatically every 5 user messages."
                    : userTier === "FREE_VERIFIED"
                      ? "Get 2 conversation summaries per month. They'll appear every 5 messages."
                      : "Conversation summaries will appear every 5 messages."
                  }
                </p>
              </div>
            </div>
          )}

          {/* Snapshots List */}
          {hasSnapshotsFeature && badge > 0 && (
            <div className="space-y-3">
              {liveHistory.map((snapshot) => {
                const id = getId(snapshot);
                const isOpen = openSnapshots[id] || false;
                const topicsText = snapshot.key_topics?.length 
                  ? snapshot.key_topics.join(", ") 
                  : "General Discussion";

                return (
                  <div key={id} className="border border-slate-200 rounded-xl overflow-hidden bg-gradient-to-br from-white to-slate-50 shadow-sm hover:shadow-md transition-shadow">
                    {/* Snapshot Header */}
                    <button
                      onClick={() => toggleSnapshot(id)}
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-gradient-to-r hover:from-teal-50 hover:to-cyan-50 transition-all duration-200"
                    >
                      <div className="flex-shrink-0">
                        <ChevronDown open={isOpen} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h4 className="text-sm font-medium text-slate-900 truncate">
                            Turns {snapshot.from_turn}—{snapshot.to_turn}
                          </h4>
                          <span className="text-xs text-slate-500 whitespace-nowrap">
                            {formatDate(snapshot.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-teal-600 truncate font-medium">
                          {topicsText}
                        </p>
                      </div>
                    </button>

                    {/* Snapshot Content */}
                    {isOpen && (
                      <div className="px-4 pb-4 space-y-4 border-t border-slate-100 bg-white">
                        {/* Key Topics */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="text-xs font-semibold text-slate-900 uppercase tracking-wide">
                              Key Topics
                            </h5>
                            <button
                              onClick={() => copy(snapshot.key_topics?.join(", ") || "", `topics-${id}`)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-teal-700 hover:bg-teal-50 rounded transition-colors"
                              title="Copy topics"
                            >
                              {copied === `topics-${id}` ? (
                                <>
                                  <CheckIcon className="w-3 h-3 text-emerald-600" />
                                  <span className="text-emerald-600 font-medium">Copied</span>
                                </>
                              ) : (
                                <>
                                  <CopyIcon className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {snapshot.key_topics?.length ? (
                              snapshot.key_topics.map((topic, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
                                  style={{
                                    backgroundColor: '#1a6b82',
                                    color: 'white'
                                  }}
                                >
                                  {topic}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-500 italic">No topics identified</span>
                            )}
                          </div>
                        </div>

                        {/* Discussion Summary */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="text-xs font-semibold text-slate-900 uppercase tracking-wide">
                              Discussion
                            </h5>
                            <button
                              onClick={() => copy(snapshot.discussion || "", `discussion-${id}`)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-teal-700 hover:bg-teal-50 rounded transition-colors"
                              title="Copy discussion summary"
                            >
                              {copied === `discussion-${id}` ? (
                                <>
                                  <CheckIcon className="w-3 h-3 text-emerald-600" />
                                  <span className="text-emerald-600 font-medium">Copied</span>
                                </>
                              ) : (
                                <>
                                  <CopyIcon className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                          <div className="bg-gradient-to-br from-slate-50 to-gray-50 rounded-lg p-3 border border-slate-200">
                            <p className="text-sm text-slate-700 leading-relaxed">
                              {snapshot.discussion || "No discussion summary available."}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Commands Section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Smart Suggestions</h3>
            <span
              className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                commands?.length > 0 && hasCommandsFeature
                  ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border-blue-200"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              {hasCommandsFeature ? commands?.length || 0 : "–"}
            </span>
          </div>

          {/* Guest user - Command suggestions locked */}
          {!hasCommandsFeature && (
            <div className="bg-gradient-to-br from-slate-50 to-gray-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center mt-0.5">
                  <svg className="w-3 h-3 text-slate-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800 mb-1">Sign in for Smart Suggestions</p>
                  <p className="text-xs text-slate-600">
                    Get personalized command suggestions based on your conversation topics. Sign up with email to unlock smart shortcuts.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* BASIC/PRO users - Show commands or empty state */}
          {hasCommandsFeature && (
            <>
              {commands?.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs text-slate-500 mb-3">
                    Commands appear when topics are mentioned 4+ times
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {commands.slice(0, 6).map((cmd, i) => (
                      <button
                        key={`${cmd.slug}-${i}`}
                        onClick={() => {
                          const { addCommand } = useSessionStore.getState();
                          addCommand({
                            label: cmd.command || cmd.slug,
                            content: `AI suggested: ${cmd.command || cmd.slug}`,
                            source: 'smart-suggestion'
                          });
                        }}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-slate-700 bg-gradient-to-r from-white to-slate-50 border border-slate-300 rounded-lg hover:from-blue-50 hover:to-indigo-50 hover:border-blue-300 hover:text-blue-700 transition-all duration-200 shadow-sm hover:shadow"
                        title={`Send "${cmd.command || cmd.slug}"`}
                      >
                        {cmd.command || cmd.slug}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-slate-50 to-gray-50 border border-slate-200 rounded-xl p-4">
                  <div className="text-center">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-slate-700 mb-1">No suggestions yet</p>
                    <p className="text-xs text-slate-500">
                      Smart command suggestions will appear when you discuss topics frequently.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}