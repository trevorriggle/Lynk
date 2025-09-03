"use client";

import { useEffect, useMemo, useState } from "react";

/** Build a fresh dummy card for the current sequence */
function makeDummyCard(seqKey) {
  const created = new Date().toISOString();
  return {
    key: String(seqKey),        // sequence identifier (stable for this run)
    created_at: created,
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
  };
}

/** Pretty text export matching exactly what's rendered on a dummy card */
function formatDummyForCopy(d) {
  const lines = [];
  lines.push(`Turns ${d.from_turn}–${d.to_turn} • ${new Date(d.created_at).toLocaleString()} • ${d.confidence}`);
  if (Array.isArray(d.topics) && d.topics.length) {
    lines.push("\nTopics:");
    for (const t of d.topics) lines.push(`- ${t.slug}${t.gloss ? ` — ${t.gloss}` : ""}`);
  }
  if (Array.isArray(d.key_details) && d.key_details.length) {
    lines.push("\nKey details:");
    for (const k of d.key_details) lines.push(`- ${k}`);
  }
  if (Array.isArray(d.decisions) && d.decisions.length) {
    lines.push("\nDecisions:");
    for (const x of d.decisions) lines.push(`- ${x}`);
  }
  if (Array.isArray(d.open_questions) && d.open_questions.length) {
    lines.push("\nOpen questions:");
    for (const q of d.open_questions) lines.push(`- ${q}`);
  }
  if (Array.isArray(d.actions) && d.actions.length) {
    lines.push("\nActions:");
    for (const a of d.actions) lines.push(`- ${a.text}${a.owner ? ` — ${a.owner}` : ""}`);
  }
  return lines.join("\n");
}

export default function RightPanel() {
  const [inspector, setInspector] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [turns, setTurns] = useState(0);

  // We keep a stack of dummy cards; newest at index 0
  const [dummies, setDummies] = useState([]);
  const [copiedKey, setCopiedKey] = useState(null);

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

  // Poll GET so we can read `turns` and know when sequences flip
  useEffect(() => {
    if (!sessionId) return;
    let timer;
    const load = async () => {
      try {
        const r = await fetch(`/api/session?sessionId=${encodeURIComponent(sessionId)}`);
        const j = await r.json();
        if (j?.inspector) setInspector(j.inspector);
        if (typeof j?.turns === "number") setTurns(j.turns);
      } catch {}
    };
    load();
    timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [sessionId]);

  // Latest server-side snapshot (we never visualize it here)
  const lastSnapshot = useMemo(
    () =>
      Array.isArray(inspector?.snapshots) && inspector.snapshots.length
        ? inspector.snapshots[inspector.snapshots.length - 1]
        : null,
    [inspector]
  );

  // Determine if we are currently collecting a new snapshot sequence
  // A "new sequence" is when there are turns beyond the last snapshot's to_turn (or no snapshot yet).
  const collecting = useMemo(() => {
    const lastTo = typeof lastSnapshot?.to_turn === "number" ? lastSnapshot.to_turn : 0;
    return turns > lastTo; // true while user keeps chatting past last snapshot
  }, [turns, lastSnapshot]);

  // Compute a stable "sequence key" for the current collecting period: (lastTo + 1)
  const currentSeqKey = useMemo(() => {
    const lastTo = typeof lastSnapshot?.to_turn === "number" ? lastSnapshot.to_turn : 0;
    return String(lastTo + 1);
  }, [lastSnapshot]);

  // Whenever we're in collecting mode AND we don't already have a dummy for this sequence,
  // push a fresh dummy card to the top of the stack.
  useEffect(() => {
    if (!collecting) return;
    setDummies((prev) => {
      if (prev.some((d) => d.key === currentSeqKey)) return prev; // already have a dummy for this sequence
      const fresh = makeDummyCard(currentSeqKey);
      return [fresh, ...prev]; // newest first
    });
  }, [collecting, currentSeqKey]);

  // Copy handler (pretty plaintext of what's visible on that dummy)
  async function copyDummy(d) {
    try {
      await navigator.clipboard.writeText(formatDummyForCopy(d));
      setCopiedKey(d.key);
      setTimeout(() => setCopiedKey(null), 1200);
    } catch {}
  }

  return (
    <aside className="hidden w-80 shrink-0 lg:block px-4 pb-4 pt-0">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        {/* keep a tiny header for debugging; remove if you prefer */}
        <div className="mb-2 text-[10px] text-slate-400">
          session: <code>{sessionId || "—"}</code>
        </div>

        {/* DUMMY PREVIEWS ONLY — newest sequence first */}
        <div className="mb-1 text-sm font-semibold text-slate-800">Preview</div>

        {dummies.length === 0 ? (
          <p className="mt-1 text-xs leading-5 text-slate-600">
            A preview dummy will appear here as soon as a new sequence begins.
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {dummies.map((d) => (
              <div key={d.key} className="rounded-md border border-slate-200 p-2 text-xs leading-5 text-slate-700">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-slate-500">
                    turns {d.from_turn}–{d.to_turn} • {new Date(d.created_at).toLocaleString()}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {d.confidence && (
                      <span className="text-[10px] rounded-full border px-1.5 py-0.5 text-slate-500">
                        {d.confidence}
                      </span>
                    )}
                    <button
                      onClick={() => copyDummy(d)}
                      className="text-[11px] rounded-md border px-2 py-0.5 hover:bg-slate-50 active:scale-[0.99]"
                      title="Copy preview text"
                    >
                      {copiedKey === d.key ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                {/* Topics */}
                {Array.isArray(d.topics) && d.topics.length > 0 && (
                  <div className="mt-1">
                    <div className="font-medium">Topics</div>
                    <ul className="list-disc pl-4">
                      {d.topics.map((t, i) => (
                        <li key={i}>
                          <b>{t.slug}</b>
                          {t.gloss ? ` — ${t.gloss}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Key details */}
                {Array.isArray(d.key_details) && d.key_details.length > 0 && (
                  <div className="mt-1">
                    <div className="font-medium">Key details</div>
                    <ul className="list-disc pl-4">
                      {d.key_details.map((k, i) => (
                        <li key={i}>{k}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Decisions */}
                {Array.isArray(d.decisions) && d.decisions.length > 0 && (
                  <div className="mt-1">
                    <div className="font-medium">Decisions</div>
                    <ul className="list-disc pl-4">
                      {d.decisions.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Open questions */}
                {Array.isArray(d.open_questions) && d.open_questions.length > 0 && (
                  <div className="mt-1">
                    <div className="font-medium">Open questions</div>
                    <ul className="list-disc pl-4">
                      {d.open_questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Actions */}
                {Array.isArray(d.actions) && d.actions.length > 0 && (
                  <div className="mt-1">
                    <div className="font-medium">Actions</div>
                    <ul className="list-disc pl-4">
                      {d.actions.map((a, i) => (
                        <li key={i}>
                          {a.text}
                          {a.owner ? <span className="text-slate-500"> — {a.owner}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
