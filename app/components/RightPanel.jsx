"use client";

import { useEffect, useState } from "react";

export default function RightPanel({ active = false, activeContext = null }) {
  const [inspector, setInspector] = useState(null);

  useEffect(() => {
    const sid =
      typeof window !== "undefined" ? localStorage.getItem("lynk_session_id") : null;
    if (!sid) return;

    let timer;
    const load = async () => {
      try {
        const r = await fetch(`/api/session?sessionId=${encodeURIComponent(sid)}`);
        const j = await r.json();
        if (j?.inspector) setInspector(j.inspector);
      } catch {
        // keep panel quiet if fetch fails
      }
    };

    load();
    if (active) timer = setInterval(load, 4000); // light polling when visible
    return () => timer && clearInterval(timer);
  }, [active]);

  const state = active ? "Active" : "Inactive";
  const ctx = inspector || activeContext;

  return (
    <aside className="hidden w-80 shrink-0 lg:block px-4 pb-4 pt-0">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-xs text-slate-500">State</div>
        <div
          className={
            "mb-4 rounded-lg px-3 py-2 text-sm " +
            (active
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-slate-50 border border-slate-200 text-slate-600")
          }
        >
          {state}
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
                      <code className="rounded bg-slate-100 px-1 py-0.5">
                        {c.command}
                      </code>{" "}
                      <span className="text-slate-500">(mentions: {c.count})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          // Fallback: previous JSON string display
          <p className="mt-2 text-xs leading-5 text-slate-600">
            {ctx
              ? JSON.stringify(ctx)
              : "This inspector lights up when you pick a Project/Command or attach Context Files."}
          </p>
        )}
      </div>
    </aside>
  );
}

