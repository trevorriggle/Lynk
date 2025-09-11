// components/RightPanel.jsx — compact, collapsible Live Notes that won't break layout
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

function Chevron({ open }) {
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <rect x="2" y="2" width="13" height="13" rx="2" />
    </svg>
  );
}

export default function RightPanel() {
  // ---- State ----
  const [auth, setAuth] = useState({ loading: true, authenticated: false, userId: null });
  const [inspector, setInspector] = useState(null);
  const [copiedKey, setCopiedKey] = useState("");
  const [openIds, setOpenIds] = useState(() => new Set()); // collapsed by default

  // ---- External store ----
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
          setAuth({ loading: false, authenticated: !!j?.userId, userId: j?.userId || null });
        } else {
          setAuth({ loading: false, authenticated: false, userId: null });
        }
      } catch {
        if (!cancelled) setAuth({ loading: false, authenticated: false, userId: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // reset panel when auth flips
  useEffect(() => {
    setInspector(null);
    setOpenIds(new Set());
  }, [auth.authenticated, auth.userId]);

  // ---- Current thread counts (cosmetic only) ----
  const currentThread = activeId ? (sessions[activeId]?.messages || []) : [];
  const threadUserCount = currentThread.filter((m) => m?.role === "user").length;
  const currentUserMessageCount = auth.authenticated ? threadUserCount : guestMessageCount;

  // ---- Event listeners to accept inspector payloads from app ----
  useEffect(() => {
    const onUpdate = (e) => e?.detail && setInspector(e.detail);
    const onMessageResponse = (e) => e?.detail?.inspector && setInspector(e.detail.inspector);
    window.addEventListener("inspector:update", onUpdate);
    window.addEventListener("message:response", onMessageResponse);
    return () => {
      window.removeEventListener("inspector:update", onUpdate);
      window.removeEventListener("message:response", onMessageResponse);
    };
  }, []);

  // ---- Poll session ----
  useEffect(() => {
    if (!activeId || auth.loading) {
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
        /* silent */
      }
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [activeId, auth.loading]);

  // ---- Shape data ----
  const historyAll = inspector?.live_history || [];
  const liveHistory = useMemo(() => {
    // newest-first and keep last 12 to avoid bulky panel
    return historyAll
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 12);
  }, [historyAll]);

  const badge = liveHistory.length;
  const suggestions = inspector?.commands || [];

  // ---- Helpers ----
  const getId = (s) => `${s.created_at}|${s.from_turn}|${s.to_turn}`;

  const toggleOpen = useCallback((id) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const copy = useCallback(async (text, key) => {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 1000);
    } catch {
      /* ignore */
    }
  }, []);

  const buildSnapshotCopy = useCallback((s) => {
    const blocks = [];
    if (s.gist) blocks.push(`SUMMARY\n${s.gist}`);
    if (s.key_points?.length) blocks.push(`KEY POINTS\n${s.key_points.map((p) => `• ${p}`).join("\n")}`);
    if (s.entities?.length) blocks.push(`ENTITIES\n${s.entities.map((e) => `• ${e}`).join("\n")}`);
    if (s.actions?.length) blocks.push(`ACTIONS\n${s.actions.map((a) => `• ${a}`).join("\n")}`);
    if (s.insights?.length) blocks.push(`INSIGHTS\n${s.insights.map((i) => `• ${i}`).join("\n")}`);
    return blocks.join("\n\n");
  }, []);

  const summarizeOneLine = (text = "") => {
    const t = text.replace(/\s+/g, " ").trim();
    return t.length > 90 ? t.slice(0, 90) + "…" : t;
  };

  // ---- Render ----
  if (auth.loading) {
    return (
      <aside className="hidden w-80 shrink-0 lg:block px-3 pb-3 pt-0">
        <div className="border border-slate-200 rounded-2xl p-4 h-full max-h-screen overflow-y-auto bg-white">
          <div className="flex items-center justify-center h-24">
            <div className="text-xs text-slate-600">Loading…</div>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="hidden w-80 shrink-0 lg:block px-3 pb-3 pt-0"
      aria-label="Right panel with session insights"
    >
      <div
        className="border border-slate-200 rounded-2xl p-4 h-full max-h-screen overflow-y-auto bg-white"
        // keep the panel visually light and self-contained
      >
        {/* Header */}
        <div className="mb-3 pb-2 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Session Insights</h2>
            <div className="flex items-center gap-1">
              <span className={`inline-block w-2 h-2 rounded-full ${auth.authenticated ? "bg-emerald-600" : "bg-amber-600"}`} />
              <span className="text-[11px] text-slate-700">{auth.authenticated ? "Verified" : "Guest"}</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-600 mt-1">
            Session Messages: {currentUserMessageCount}
          </div>
        </div>

        {/* Live Notes */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-900">Live Notes</h3>
            <span
              className={`px-1.5 min-w-5 h-5 inline-flex items-center justify-center rounded-full text-[10px] font-semibold ${
                badge > 0 ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"
              }`}
              title="Snapshots available"
            >
              {badge}
            </span>
          </div>

          {!auth.authenticated && (
            <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
              Sign in to enable Live Notes with compact, collapsible snapshots.
            </div>
          )}

          {auth.authenticated && badge === 0 && (
            <div className="text-[11px] text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              Snapshots appear automatically as you chat.
            </div>
          )}

          {auth.authenticated && badge > 0 && (
            <div className="space-y-2">
              {liveHistory.map((s) => {
                const id = getId(s);
                const open = openIds.has(id);
                const when = new Date(s.created_at);
                const header = `User turns ${s.from_turn}—${s.to_turn}`;
                const preview = s.gist ? summarizeOneLine(s.gist) : "Snapshot";
                const fullCopy = buildSnapshotCopy(s);

                return (
                  <div
                    key={id}
                    className="border border-slate-200 rounded-xl"
                  >
                    {/* Row header */}
                    <button
                      onClick={() => toggleOpen(id)}
                      className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-slate-50 rounded-t-xl"
                      title={open ? "Collapse" : "Expand"}
                    >
                      <Chevron open={open} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[12px] font-medium text-slate-900 truncate">
                            {header}
                          </div>
                          <div className="text-[10px] text-slate-500 whitespace-nowrap">
                            {when.toLocaleDateString()} · {when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-700 truncate">{preview}</div>
                      </div>

                      {/* small copy-all pill */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          copy(fullCopy, `all-${id}`);
                        }}
                        className="ml-1 inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 active:scale-95"
                        title="Copy all"
                        role="button"
                      >
                        <CopyIcon />
                        {copiedKey === `all-${id}` ? "Copied" : "Copy"}
                      </div>
                    </button>

                    {/* Body (collapsible) */}
                    {open && (
                      <div className="px-2.5 pb-2.5 pt-0 space-y-1.5">
                        {/* Summary */}
                        {s.gist && (
                          <Section
                            title="Summary"
                            onCopy={() => copy(s.gist, `sum-${id}`)}
                            copied={copiedKey === `sum-${id}`}
                          >
                            <p className="text-[11px] text-slate-800 whitespace-pre-wrap leading-relaxed">
                              {s.gist}
                            </p>
                          </Section>
                        )}

                        {/* Key Points */}
                        {Array.isArray(s.key_points) && s.key_points.length > 0 && (
                          <Section
                            title="Key Points"
                            onCopy={() => copy(s.key_points.map((p) => `• ${p}`).join("\n"), `kp-${id}`)}
                            copied={copiedKey === `kp-${id}`}
                          >
                            <ul className="space-y-1">
                              {s.key_points.map((p, i) => (
                                <li
                                  key={`kp-${i}`}
                                  className="text-[11px] text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-1 cursor-pointer hover:bg-slate-50"
                                  onClick={() => copy(p, `kp-${id}-${i}`)}
                                  title="Click to copy"
                                >
                                  • {p}
                                </li>
                              ))}
                            </ul>
                          </Section>
                        )}

                        {/* Entities */}
                        {Array.isArray(s.entities) && s.entities.length > 0 && (
                          <Section
                            title="Entities"
                            onCopy={() => copy(s.entities.map((e) => `• ${e}`).join("\n"), `ent-${id}`)}
                            copied={copiedKey === `ent-${id}`}
                          >
                            <div className="flex flex-wrap gap-1">
                              {s.entities.map((e, i) => (
                                <span
                                  key={`ent-${i}`}
                                  className="text-[10px] px-2 py-1 rounded-full border border-slate-300 bg-white text-slate-700 cursor-pointer hover:bg-slate-50"
                                  onClick={() => copy(e, `ent-${id}-${i}`)}
                                  title="Click to copy"
                                >
                                  {e}
                                </span>
                              ))}
                            </div>
                          </Section>
                        )}

                        {/* Actions */}
                        {Array.isArray(s.actions) && s.actions.length > 0 && (
                          <Section
                            title="Actions"
                            onCopy={() => copy(s.actions.map((a) => `• ${a}`).join("\n"), `act-${id}`)}
                            copied={copiedKey === `act-${id}`}
                          >
                            <ul className="space-y-1">
                              {s.actions.map((a, i) => (
                                <li
                                  key={`act-${i}`}
                                  className="text-[11px] text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-1 cursor-pointer hover:bg-slate-50"
                                  onClick={() => copy(a, `act-${id}-${i}`)}
                                  title="Click to copy"
                                >
                                  {a}
                                </li>
                              ))}
                            </ul>
                          </Section>
                        )}

                        {/* Insights */}
                        {Array.isArray(s.insights) && s.insights.length > 0 && (
                          <Section
                            title="Insights"
                            onCopy={() => copy(s.insights.map((i) => `• ${i}`).join("\n"), `ins-${id}`)}
                            copied={copiedKey === `ins-${id}`}
                          >
                            <ul className="space-y-1">
                              {s.insights.map((i, ix) => (
                                <li
                                  key={`ins-${ix}`}
                                  className="text-[11px] text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-1 cursor-pointer hover:bg-slate-50"
                                  onClick={() => copy(i, `ins-${id}-${ix}`)}
                                  title="Click to copy"
                                >
                                  {i}
                                </li>
                              ))}
                            </ul>
                          </Section>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Suggestions (compact) */}
        {suggestions?.length > 0 && (
          <div className="border border-slate-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-900">Suggestions</h3>
              <span className="text-[10px] text-slate-600 bg-slate-100 rounded-full px-1.5 py-0.5">
                {suggestions.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
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
                    className="text-[11px] px-2 py-1 rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:scale-95"
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

/** Lightweight section wrapper with tiny copy button */
function Section({ title, children, onCopy, copied }) {
  return (
    <section className="border border-slate-200 rounded-lg p-2 bg-slate-50/40">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-[11px] font-semibold text-slate-900">{title}</h4>
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:scale-95"
          title="Copy"
        >
          <CopyIcon />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {children}
    </section>
  );
}
