"use client";

import { useEffect, useState } from "react";

export default function RightPanel({ active = false, activeContext = null }) {
  const [inspector, setInspector] = useState(null);
  const [sessionId, setSessionId] = useState(null);

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
        // keep panel quiet on fetch errors
      }
    };
    load();
    if (active) timer = setInterval(load, 4000);
    return () => timer && clearInterval(timer);
  }, [active, sessionId]);

  const state = active ? "Active" : "Inactive";

  return (
    <aside className="hidden w-80 shrink-0 lg:block px-4 pb-4 pt-0">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-xs text-slate-500">State</div>
        <div
          className={
            "mb-1 rounded-lg px-3 py-2 text-sm " +
            (active
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-slate-50 border border-slate-200 text-slate-600")
          }
        >
          {state}
        </div>
        <div className="mb-2 text-[10px] text-slate-400">
          session: <code>{sessionId || "—"}</code>
        </div>

        <div className="text-sm font-semibold text-slate-800">Inspector</div>

        {/* Pretty view if inspector present */}
        {inspector?.live ? (
          <div className="mt-3 space-y-3 text-xs leading-5 text-slate-700">
            {inspector.live.gist ? (
              <div>
                <div className="mb-1 font-medium text-slate-900">Gist</div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                  {inspector.live.gist}
                </div>
              </div>
            ) : null}

            {Array.isArray(inspector.live.key_points) &&
            inspector.live.key_points.length > 0 ? (
              <div>
                <div className="mb-1 font-medium text-slate-900">Key points</div>
                <ul className="list-disc pl-5">
                  {inspector.live.key_points.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {Array.isArray(inspector.live.todos) &&
            inspector.live.todos.length > 0 ? (
              <div>
                <div className="mb-1 font-medium text-slate-900">To-dos</div>
                <ul className="pl-0">
                  {inspector.live.todos.map((t, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <input type="checkbox" disabled className="mt-1" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {Array.isArray(inspector.live.entities) &&
            inspector.live.entities.length > 0 ? (
              <div>
                <div className="mb-1 font-medium text-slate-900">Entities</div>
                <div className="flex flex-wrap gap-1.5">
                  {inspector.live.entities.map((e, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5"
                    >
                      {e}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {Array.isArray(inspector.commands) && inspector.commands.length > 0 ? (
              <div>
                <div className="mb-1 font-medium text-slate-900">Suggested commands</div>
                <ul className="list-disc pl-5">
                  {inspector.commands.map((c, i) => (
                    <li key={i}>
                      <code className="rounded bg-slate-100 px-1 py-0.5">{c.command}</code>{" "}
                      <span className="text-slate-500">(mentions: {c.count})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Snapshots */}
            {Array.isArray(inspector.snapshots) && inspector.snapshots.length > 0 && (
              <div className="pt-2 border-t border-slate-200">
                <div className="mb-1 text-sm font-semibold text-slate-800">Snapshots</div>
                <div className="space-y-2">
                  {inspector.snapshots.slice(-5).reverse().map((s, i) => (
                    <div key={i} className="rounded-md border border-slate-200 p-2">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] text-slate-500">
                          turns {s.from_turn}–{s.to_turn} • {new Date(s.created_at).toLocaleString()}
                        </div>
                        {s.confidence && (
                          <span className="text-[10px] rounded-full border px-1.5 py-0.5 text-slate-500">
                            {s.confidence}
                          </span>
                        )}
                      </div>

                      {Array.isArray(s.topics) && s.topics.length > 0 && (
                        <div className="mt-1 text-xs">
                          <div className="font-medium">Topics</div>
                          <ul className="list-disc pl-4">
                            {s.topics.map((t, j) => (
                              <li key={j}><b>{t.slug}</b>{t.gloss ? ` — ${t.gloss}` : ""}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {Array.isArray(s.key_details) && s.key_details.length > 0 && (
                        <div className="mt-1 text-xs">
                          <div className="font-medium">Key details</div>
                          <ul className="list-disc pl-4">
                            {s.key_details.map((k, j) => (<li key={j}>{k}</li>))}
                          </ul>
                        </div>
                      )}

                      {/* Optional: show decisions/open questions/actions in a compact way */}
                      {Array.isArray(s.decisions) && s.decisions.length > 0 && (
                        <div className="mt-1 text-xs">
                          <div className="font-medium">Decisions</div>
                          <ul className="list-disc pl-4">
                            {s.decisions.map((d, j) => (<li key={j}>{d}</li>))}
                          </ul>
                        </div>
                      )}
                      {Array.isArray(s.open_questions) && s.open_questions.length > 0 && (
                        <div className="mt-1 text-xs">
                          <div className="font-medium">Open questions</div>
                          <ul className="list-disc pl-4">
                            {s.open_questions.map((q, j) => (<li key={j}>{q}</li>))}
                          </ul>
                        </div>
                      )}
                      {Array.isArray(s.actions) && s.actions.length > 0 && (
                        <div className="mt-1 text-xs">
                          <div className="font-medium">Actions</div>
                          <ul className="list-disc pl-4">
                            {s.actions.map((a, j) => (
                              <li key={j}>
                                {a.text}{a.owner ? <span className="text-slate-500"> — {a.owner}</span> : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs leading-5 text-slate-600">
            This inspector lights up as you chat. If nothing appears, check your environment
            keys and session id above.
          </p>
        )}
      </div>
    </aside>
  );
}
