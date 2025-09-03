"use client";

import { useEffect, useState } from "react";

// build a fresh dummy card
function makeDummyCard(seqKey) {
  const created = new Date().toISOString();
  return {
    key: String(seqKey),
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

// pretty plaintext for copy
function formatDummyForCopy(d) {
  const lines = [];
  lines.push(`Turns ${d.from_turn}–${d.to_turn} • ${new Date(d.created_at).toLocaleString()} • ${d.confidence}`);
  if (d.topics?.length) {
    lines.push("\nTopics:");
    d.topics.forEach((t) => lines.push(`- ${t.slug}${t.gloss ? ` — ${t.gloss}` : ""}`));
  }
  if (d.key_details?.length) {
    lines.push("\nKey details:");
    d.key_details.forEach((k) => lines.push(`- ${k}`));
  }
  if (d.decisions?.length) {
    lines.push("\nDecisions:");
    d.decisions.forEach((x) => lines.push(`- ${x}`));
  }
  if (d.open_questions?.length) {
    lines.push("\nOpen questions:");
    d.open_questions.forEach((q) => lines.push(`- ${q}`));
  }
  if (d.actions?.length) {
    lines.push("\nActions:");
    d.actions.forEach((a) => lines.push(`- ${a.text}${a.owner ? ` — ${a.owner}` : ""}`));
  }
  return lines.join("\n");
}

export default function RightPanel() {
  const [inspector, setInspector] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [dummies, setDummies] = useState([]);
  const [copiedKey, setCopiedKey] = useState(null);
  const [lastSnapshotCount, setLastSnapshotCount] = useState(0);

  // Discover the session id used by Chat.jsx
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sid = localStorage.getItem("lynk_session_id");
    setSessionId(sid || null);
  }, []);

  // Listen for inspector updates
  useEffect(() => {
    function onUpdate(e) {
      if (e?.detail) setInspector(e.detail);
    }
    window.addEventListener("inspector:update", onUpdate);
    return () => window.removeEventListener("inspector:update", onUpdate);
  }, []);

  // Poll GET to refresh inspector
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

  // Watch for snapshot count increases
  useEffect(() => {
    const count = inspector?.snapshots?.length || 0;
    if (count > lastSnapshotCount) {
      // a new snapshot was created → spawn a fresh dummy card
      const seqKey = `${count}-${Date.now()}`;
      setDummies((prev) => [makeDummyCard(seqKey), ...prev]);
      setLastSnapshotCount(count);
    } else if (count < lastSnapshotCount) {
      // reset (new session, etc.)
      setLastSnapshotCount(count);
      setDummies([]);
    }
  }, [inspector, lastSnapshotCount]);

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
        <div className="mb-2 text-[10px] text-slate-400">
          session: <code>{sessionId || "—"}</code>
        </div>

        <div className="mb-1 text-sm font-semibold text-slate-800">Previews</div>
        {dummies.length === 0 ? (
          <p className="mt-1 text-xs leading-5 text-slate-600">
            A preview dummy will appear here as soon as the first snapshot is created.
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {dummies.map((d) => (
              <div
                key={d.key}
                className="rounded-md border border-slate-200 p-2 text-xs leading-5 text-slate-700"
              >
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

                {d.topics?.length > 0 && (
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

                {d.key_details?.length > 0 && (
                  <div className="mt-1">
                    <div className="font-medium">Key details</div>
                    <ul className="list-disc pl-4">
                      {d.key_details.map((k, i) => (
                        <li key={i}>{k}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {d.decisions?.length > 0 && (
                  <div className="mt-1">
                    <div className="font-medium">Decisions</div>
                    <ul className="list-disc pl-4">
                      {d.decisions.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {d.open_questions?.length > 0 && (
                  <div className="mt-1">
                    <div className="font-medium">Open questions</div>
                    <ul className="list-disc pl-4">
                      {d.open_questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {d.actions?.length > 0 && (
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
