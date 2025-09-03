"use client";

import { useEffect, useMemo, useState } from "react";

export default function RightPanel() {
  const [inspector, setInspector] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null); // track which snapshot was just copied

  // Discover the session id used by Chat.jsx
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sid = localStorage.getItem("lynk_session_id");
    setSessionId(sid || null);
  }, []);

  // Listen for real-time inspector payloads from Chat.jsx
  useEffect(() => {
    function onUpdate(e) {
      if (e?.detail) setInspector(e.detail);
    }
    window.addEventListener("inspector:update", onUpdate);
    return () => window.removeEventListener("inspector:update", onUpdate);
  }, []);

  // Poll as a backup so the panel can refresh even on page reload
  useEffect(() => {
    if (!sessionId) return;
    let timer;
    const load = async () => {
      try {
        const r = await fetch(`/api/session?sessionId=${encodeURIComponent(sessionId)}`);
        const j = await r.json();
        if (j?.inspector) setInspector(j.inspector);
      } catch {
        // silent
      }
    };
    load();
    // poll gently; snapshots appear every N turns so no need to be aggressive
    timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [sessionId]);

  const snapshots = useMemo(
    () => (Array.isArray(inspector?.snapshots) ? inspector.snapshots : []),
    [inspector]
  );

  async function copySnapshot(s, idx) {
    try {
      // Prefer a pretty, portable block (not gigantic)
      const clean = {
        created_at: s.created_at,
        range: { from_turn: s.from_turn, to_turn: s.to_turn },
        confidence: s.confidence,
        topics: s.topics,
        key_details: s.key_details,
        decisions: s.decisions,
        open_questions: s.open_questions,
        actions: s.actions,
        entities: s.entities,
        links: s.links,
        model: s.model,
      };
      await navigator.clipboard.writeText(JSON.stringify(clean, null, 2));
      setCopiedKey(idx);
      setTimeout(() => setCopiedKey(null), 1200);
    } catch {
      // no-op
    }
  }

  return (
    <aside className="hidden w-80 shrink-0 lg:block px-4 pb-4 pt-0">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        {/* Minimal header */}
        <div className="mb-2 text-[10px] text-slate-400">
          session: <code>{sessionId || "—"}</code>
        </div>

        {/* Snapshots only */}
        <div className="mb-1 text-sm font-semibold text-slate-800">Snapshots</div>

        {snapshots.length === 0 ? (
          <p className="mt-2 text-xs leading-5 text-slate-600">
            No snapshots yet. They’ll appear here automatically every few turns.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {snapshots
              .slice(-8)         // show the most recent up to 8
              .reverse()         // newest first
              .map((s, i) => {
                const idx = snapshots.length - 1 - i; // stable key for copied state
                return (
                  <div key={`${s.created_at}-${s.from_turn}-${s.to_turn}`} className="rounded-md border border-slate-200 p-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] text-slate-500">
                        turns {s.from_turn}–{s.to_turn} • {new Date(s.created_at).toLocaleString()}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {s.confidence && (
                          <span className="text-[10px] rounded-full border px-1.5 py-0.5 text-slate-500">
                            {s.confidence}
                          </span>
                        )}
                        <button
                          onClick={() => copySnapshot(s, idx)}
                          className="text-[11px] rounded-md border px-2 py-0.5 hover:bg-slate-50 active:scale-[0.99]"
                          title="Copy snapshot JSON"
                        >
                          {copiedKey === idx ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    </div>

                    {/* Topics */}
                    {Array.isArray(s.topics) && s.topics.length > 0 && (
                      <div className="mt-1 text-xs">
                        <div className="font-medium">Topics</div>
                        <ul className="list-disc pl-4">
                          {s.topics.map((t, j) => (
                            <li key={j}>
                              <b>{t.slug}</b>
                              {t.gloss ? ` — ${t.gloss}` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Key details */}
                    {Array.isArray(s.key_details) && s.key_details.length > 0 && (
                      <div className="mt-1 text-xs">
                        <div className="font-medium">Key details</div>
                        <ul className="list-disc pl-4">
                          {s.key_details.map((k, j) => <li key={j}>{k}</li>)}
                        </ul>
                      </div>
                    )}

                    {/* Optional compact sections */}
                    {Array.isArray(s.decisions) && s.decisions.length > 0 && (
                      <div className="mt-1 text-xs">
                        <div className="font-medium">Decisions</div>
                        <ul className="list-disc pl-4">
                          {s.decisions.map((d, j) => <li key={j}>{d}</li>)}
                        </ul>
                      </div>
                    )}

                    {Array.isArray(s.open_questions) && s.open_questions.length > 0 && (
                      <div className="mt-1 text-xs">
                        <div className="font-medium">Open questions</div>
                        <ul className="list-disc pl-4">
                          {s.open_questions.map((q, j) => <li key={j}>{q}</li>)}
                        </ul>
                      </div>
                    )}

                    {Array.isArray(s.actions) && s.actions.length > 0 && (
                      <div className="mt-1 text-xs">
                        <div className="font-medium">Actions</div>
                        <ul className="list-disc pl-4">
                          {s.actions.map((a, j) => (
                            <li key={j}>
                              {a.text}
                              {a.owner ? <span className="text-slate-500"> — {a.owner}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </aside>
  );
}
