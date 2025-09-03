"use client";

import { useEffect, useMemo, useState } from "react";

// fresh dummy each time we need one
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
  const [turns, setTurns] = useState(0);        // << read from GET payload
  const [copied, setCopied] = useState(false);

  // Discover the session id used by Chat.jsx
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sid = localStorage.getItem("lynk_session_id");
    setSessionId(sid || null);
  }, []);

  // Listen for real-time inspector payloads from Chat.jsx (event won't have "turns")
  useEffect(() => {
    function onUpdate(e) {
      if (e?.detail) setInspector(e.detail);
    }
    window.addEventListener("inspector:update", onUpdate);
    return () => window.removeEventListener("inspector:update", onUpdate);
  }, []);

  // Poll GET so we also track `turns` (needed to know if a new sequence started)
  useEffect(() => {
    if (!sessionId) return;
    const load = async () => {
      try {
        const r = await fetch(`/api/session?sessionId=${encodeURIComponent(sessionId)}`);
        const j = await r.json();
        if (j?.inspector) setInspector(j.inspector);
        if (typeof j?.turns === "number") setTurns(j.turns);
      } catch {}
    };
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [sessionId]);

  const snapshots = useMemo(
    () => (Array.isArray(inspector?.snapshots) ? inspector.snapshots : []),
    [inspector]
  );
  const last = snapshots.at(-1) || null;

  // A "new sequence" means there are new turns since the last snapshot,
  // OR there are no snapshots yet (initial collection).
  const collecting =
    !last ? turns >= 0 : turns > (typeof last.to_turn === "number" ? last.to_turn : 0);

  // UI model:
  //  - collecting = true  -> show DUMMY preview; no snapshot visualization;
  //                         but if a last snapshot exists, show one-line "Last snapshot saved" row with Copy.
  //  - collecting = false -> hide dummy; show compact "Snapshot saved" row with Copy (no visualization).
  const preview = useMemo(() => (collecting ? makeDummySnapshot() : null), [collecting]);

  async function copyJSON(obj) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  function lastSnapshotRow(label = "Last snapshot") {
    if (!last) return null;
    const when = new Date(last.created_at || Date.now()).toLocaleString();
    return (
      <div className="mt-2 flex items-center justify-between rounded-md border border-slate-200 px-2 py-1.5 text-[11px] text-slate-600">
        <span>
          {label}: turns {last.from_turn}–{last.to_turn} • {when}
        </span>
        <div className="flex items-center gap-1.5">
          {last.confidence && (
            <span className="rounded-full border px-1.5 py-0.5">{last.confidence}</span>
          )}
          <button
            onClick={() => copyJSON({
              created_at: last.created_at,
              range: { from_turn: last.from_turn, to_turn: last.to_turn },
              confidence: last.confidence,
              topics: last.topics,
              key_details: last.key_details,
              decisions: last.decisions,
              open_questions: last.open_questions,
              actions: last.actions,
              entities: last.entities,
              links: last.links,
              model: last.model,
            })}
            className="text-[11px] rounded-md border px-2 py-0.5 hover:bg-slate-50 active:scale-[0.99]]"
            title="Copy snapshot JSON"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <aside className="hidden w-80 shrink-0 lg:block px-4 pb-4 pt-0">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-[10px] text-slate-400">
          session: <code>{sessionId || "—"}</code>
        </div>

        {/* Collecting -> Dummy preview; no snapshot list */}
        {collecting ? (
          <>
            <div className="mb-1 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">Preview (waiting for snapshot…)</div>
              <button
                onClick={() => copyJSON(preview)}
                className="text-[11px] rounded-md border px-2 py-0.5 hover:bg-slate-50 active:scale-[0.99]"
                title="Copy preview JSON"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            {/* Dummy content block */}
            <div className="rounded-md border border-slate-200 p-2 text-xs leading-5 text-slate-700">
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-slate-500">
                  turns {preview.from_turn}–{preview.to_turn} • {new Date(preview.created_at).toLocaleString()}
                </div>
                <span className="text-[10px] rounded-full border px-1.5 py-0.5 text-slate-500">
                  {preview.confidence}
                </span>
              </div>

              {/* Minimal fields so it looks rich while collecting */}
              <div className="mt-1">
                <div className="font-medium">Topics</div>
                <ul className="list-disc pl-4">
                  {preview.topics.map((t, i) => (
                    <li key={i}>
                      <b>{t.slug}</b>{t.gloss ? ` — ${t.gloss}` : ""}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-1">
                <div className="font-medium">Key details</div>
                <ul className="list-disc pl-4">
                  {preview.key_details.map((k, i) => <li key={i}>{k}</li>)}
                </ul>
              </div>

              <div className="mt-1">
                <div className="font-medium">Decisions</div>
                <ul className="list-disc pl-4">
                  {preview.decisions.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>

              <div className="mt-1">
                <div className="font-medium">Open questions</div>
                <ul className="list-disc pl-4">
                  {preview.open_questions.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </div>

              <div className="mt-1">
                <div className="font-medium">Actions</div>
                <ul className="list-disc pl-4">
                  {preview.actions.map((a, i) => (
                    <li key={i}>{a.text}{a.owner ? <span className="text-slate-500"> — {a.owner}</span> : null}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Tiny acknowledgment that the prior snapshot still exists */}
            {lastSnapshotRow("Last snapshot")}
          </>
        ) : (
          // Saved -> no dummy, no visualization; just a compact saved row with Copy
          <>
            <div className="mb-1 text-sm font-semibold text-slate-800">Snapshot</div>
            {lastSnapshotRow("Snapshot saved")}
          </>
        )}
      </div>
    </aside>
  );
}

