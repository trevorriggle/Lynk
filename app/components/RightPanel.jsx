// components/RightPanel.jsx — ONLY Green Live Notes + Commands. Live Notes update every 5 user turns. No snapshots at all.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

export default function RightPanel() {
  const [inspector, setInspector] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [authState, setAuthState] = useState({ loading: true, authenticated: false });

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

  // message counts (for green badge)
  const currentThread = activeId ? sessions[activeId]?.messages || [] : [];
  const threadUserCount = currentThread.filter((m) => m?.role === "user").length;
  const currentUserMessageCount = authState.authenticated ? threadUserCount : guestMessageCount;
  const liveNoteCycles = Math.floor(currentUserMessageCount / 5); // green badge number

  // receive push updates
  useEffect(() => {
    const onUpdate = (e) => e?.detail && setInspector(e.detail);
    window.addEventListener("inspector:update", onUpdate);
    return () => window.removeEventListener("inspector:update", onUpdate);
  }, []);

  // poll backend
  useEffect(() => {
    if (!activeId) {
      setInspector(null);
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
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [activeId]);

  const live = inspector?.live || {};
  const commands = inspector?.commands || [];

  async function copyToClipboard(text, key) {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1000);
    } catch {}
  }

  // simple style tokens
  const chip =
    "text-xs px-3 py-1.5 rounded-full border bg-white/70 border-emerald-300 text-emerald-900 hover:bg-white active:scale-95 transition";

  // Render
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

        {/* GREEN LIVE NOTES — the star of the show */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-emerald-900">Live Notes</h3>
            <div
              className={`min-w-6 h-6 px-2 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                liveNoteCycles > 0 ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"
              }`}
              title="Live Notes updates every 5 user turns"
            >
              {liveNoteCycles}
            </div>
          </div>

          {liveNoteCycles === 0 && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-300 rounded-2xl p-4 text-xs text-emerald-900">
              First Live Notes will appear at turn 5.
            </div>
          )}

          {liveNoteCycles > 0 && (
            <div className="bg-gradient-to-r from-emerald-100 to-teal-100 border border-emerald-300 rounded-2xl p-4">
              {/* Summary */}
              {live.gist && (
                <div className="mb-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-emerald-900 mb-1">Summary</div>
                    <button
                      onClick={() => copyToClipboard(live.gist, "live-gist")}
                      className={chip}
                    >
                      {copiedKey === "live-gist" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <div
                    className="text-xs text-emerald-900 bg-white/80 border border-emerald-300 rounded-lg p-2"
                    onClick={() => copyToClipboard(live.gist, "live-gist")}
                    title="Click to copy"
                  >
                    {live.gist}
                  </div>
                </div>
              )}

              {/* Key Points */}
              {Array.isArray(live.key_points) && live.key_points.length > 0 && (
                <div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-emerald-900 mb-1">Key Points</div>
                    <button
                      onClick={() =>
                        copyToClipboard(live.key_points.map((p) => `• ${p}`).join("\n"), "live-kp")
                      }
                      className={chip}
                    >
                      {copiedKey === "live-kp" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <div className="space-y-1">
                    {live.key_points.map((p, i) => (
                      <div
                        key={`kp-${i}`}
                        className="text-xs text-emerald-900 bg-white/80 border border-emerald-300 rounded-lg p-2"
                        onClick={() => copyToClipboard(p, `kp-${i}`)}
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

        {/* COMMANDS (suggestions) */}
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
                .slice(0, 10)
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
