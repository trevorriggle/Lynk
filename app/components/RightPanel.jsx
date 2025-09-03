"use client";

import { useEffect, useMemo, useState } from "react";

// build a fresh dummy every time we need one
function makeDummySnapshot() {
  return {
    created_at: new Date().toISOString(),
    from_turn: 1,
    to_turn: 5,
    confidence: "med",
    topics: [
      { slug: "example-topic", gloss: "one-line gloss of what was discussed" },
      { slug: "second-topic", gloss: "another compact description" },
    ],
    key_details: [
      "key detail #1 (≤ 12 words)",
      "key detail #2 (≤ 12 words)",
      "key detail #3 (≤ 12 words)",
    ],
    decisions: ["picked option B for phase 1"],
    open_questions: ["confirm permit timeline with city"],
    actions: [{ text: "draft follow-up email", owner: "trevor" }],
    entities: ["Columbus Zoo", "Zoobezi Bay"],
    links: ["columbuszoo.org", "press-release.pdf"],
    model: { provider: "openai", model: "gpt-4o-mini" },
  };
}

export default function RightPanel() {
  const [inspector, setInspector] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [copied, setCopied] = useState(false);

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
    const load = async () => {
      try {
        const r = await fetch(`/api/session?sessionId=${encodeURIComponent(sessionId)}`);
        const j = await r.json();
        if (j?.inspector) setInspector(j.inspector);
      } catch {}
    };
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [sessionId]);

  const snapshots = useMemo(
    () => (Array.isArray(inspector?.snapshots) ? inspector.snapshots : []),
    [inspector]
  );

  // Decide preview: if latest is empty OR no snapshots yet, show a *fresh* dummy
  const { preview, usingDummy } = useMemo(() => {
    const latest = snapshots.at(-1);
    const tooEmpty =
      !latest ||
      ((Array.isArray(latest.topics) ? latest.topics.length : 0) === 0 &&
        (Array.isArray(latest.key_details) ? latest.key_details.length : 0) === 0);
    if (tooEmpty) return { preview: makeDummySnapshot(), usingDummy: true };
    return { preview: latest, usingDummy: false };
  }, [snapshots]);

  async function copyPreview() {
    try {
      const clean = {
        created_at: preview.created_at,
        range: { from_turn: preview.from_turn, to_turn: preview.to_turn },
        confidence: preview.confidence,
        topics: preview.topics,
        key_details: preview.key_details,
        decisions: preview.decisions,
        open_questions: preview.open_questions,
        actions: preview.actions,
        entities: preview.entities,
        links: preview.links,
        model: preview.model,
      };
      await navigator.clipboard.writeText(JSON.stringify(clean, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  return (
    <aside className="hidden w-80 shrink-0 lg:block px-4 pb-4 pt-0">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        {/* Minimal header */}
        <div className="mb-2 text-[10px] text-slate-400">
          session: <code>{sessionId || "—"}</code>
        </div>

        {/* Snapshots list ONLY when we have a real snapshot */}
        {!usingDummy && (
          <>
            <div className="mb-1 text-sm font-semibold text-slate-800">Snapshots</div>
            {snapshots.length === 0 ? (
              <p className="mt-1 text-xs leading-5 text-slate-600">
                No snapshots yet. They’ll appear automatically every few turns.
              </p>
            ) : (
              <div className="mt-2 space-y-1">
                {snapshots.slice(-8).map((s, i) => (
                  <div
                    key={`${s.created_at}-${s.from_turn}-${s.to_turn}-${i}`}
                    className="flex items-center justify-between rounded-md border border-slate-200 px-2 py-1.5 text-[11px] text-slate-600"
                  >
                    <span>
                      turns {s.from_turn}–{s.to_turn} • {new Date(s.created_at).toLocaleString()}
                    </span>
                    {s.confidence && (
                      <span className="rounded-full border px-1.5 py-0.5">{s.confidence}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* PREVIEW card — always shown (dummy or real) with Copy */}
        <div className="mt-4 border-t border-slate-200 pt-3">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">
              {usingDummy ? "Preview (waiting for snapshot…)" : "Preview"}
            </div>
            <button
              onClick={copyPreview}
              className="text-[11px] rounded-md border px-2 py-0.5 hover:bg-slate-50 active:scale-[0.99]"
              title="Copy preview JSON"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <div className="rounded-md border border-slate-200 p-2 text-xs leading-5 text-slate-700">
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-slate-500">
                turns {preview.from_turn ?? "—"}–{preview.to_turn ?? "—"} •{" "}
                {new Date(preview.created_at || Date.now()).toLocaleString()}
              </div>
              {preview.confidence && (
                <span className="text-[10px] rounded-full border px-1.5 py-0.5 text-slate-500">
                  {preview.confidence}
                </span>
              )}
            </div>

            {Array.isArray(preview.topics) && preview.topics.length > 0 && (
              <div className="mt-1">
                <div className="font-medium">Topics</div>
                <ul className="list-disc pl-4">
                  {preview.topics.map((t, i) => (
                    <li key={i}>
                      <b>{t.slug}</b>
                      {t.gloss ? ` — ${t.gloss}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(preview.key_details) && preview.key_details.length > 0 && (
              <div className="mt-1">
                <div className="font-medium">Key details</div>
                <ul className="list-disc pl-4">
                  {preview.key_details.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(preview.decisions) && preview.decisions.length > 0 && (
              <div className="mt-1">
                <div className="font-medium">Decisions</div>
                <ul className="list-disc pl-4">
                  {preview.decisions.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(preview.open_questions) && preview.open_questions.length > 0 && (
              <div className="mt-1">
                <div className="font-medium">Open questions</div>
                <ul className="list-disc pl-4">
                  {preview.open_questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(preview.actions) && preview.actions.length > 0 && (
              <div className="mt-1">
                <div className="font-medium">Actions</div>
                <ul className="list-disc pl-4">
                  {preview.actions.map((a, i) => (
                    <li key={i}>
                      {a.text}
                      {a.owner ? <span className="text-slate-500"> — {a.owner}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
