"use client";

import { useEffect, useState } from "react";

// build a fresh dummy card
function makeDummyCard(seqKey) {
  return {
    key: String(seqKey),
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
    hydrated: false, // mark until snapshot merges
  };
}

// pretty plaintext for copy
function formatCardForCopy(c) {
  const lines = [];
  lines.push(
    `Turns ${c.from_turn ?? "?"}–${c.to_turn ?? "?"} • ${new Date(
      c.created_at
    ).toLocaleString()} • ${c.confidence}`
  );
  if (c.topics?.length) {
    lines.push("\nTopics:");
    c.topics.forEach((t) =>
      lines.push(`- ${t.slug}${t.gloss ? ` — ${t.gloss}` : ""}`)
    );
  }
  if (c.key_details?.length) {
    lines.push("\nKey details:");
    c.key_details.forEach((k) => lines.push(`- ${k}`));
  }
  if (c.decisions?.length) {
    lines.push("\nDecisions:");
    c.decisions.forEach((x) => lines.push(`- ${x}`));
  }
  if (c.open_questions?.length) {
    lines.push("\nOpen questions:");
    c.open_questions.forEach((q) => lines.push(`- ${q}`));
  }
  if (c.actions?.length) {
    lines.push("\nActions:");
    c.actions.forEach((a) =>
      lines.push(`- ${a.text}${a.owner ? ` — ${a.owner}` : ""}`)
    );
  }
  return lines.join("\n");
}

export default function RightPanel() {
  const [inspector, setInspector] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [cards, setCards] = useState([]); // stack of dummy/snapshots
  const [copiedKey, setCopiedKey] = useState(null);
  const [lastSnapshotCount, setLastSnapshotCount] = useState(0);

  // Discover session id
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
        const r = await fetch(
          `/api/session?sessionId=${encodeURIComponent(sessionId)}`
        );
        const j = await r.json();
        if (j?.inspector) setInspector(j.inspector);
      } catch {}
    };
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [sessionId]);

  // Watch snapshots to spawn & hydrate
  useEffect(() => {
    const snaps = inspector?.snapshots || [];
    const count = snaps.length;

    // Spawn new dummy if snapshot count increased
    if (count > lastSnapshotCount) {
      const seqKey = `${count}-${Date.now()}`;
      setCards((prev) => [makeDummyCard(seqKey), ...prev]);
      setLastSnapshotCount(count);
    } else if (count < lastSnapshotCount) {
      // reset
      setCards([]);
      setLastSnapshotCount(count);
    }

    // Hydrate the top N cards with real snapshots
    if (count > 0) {
      setCards((prev) => {
        const updated = [...prev];
        for (let i = 0; i < count && i < updated.length; i++) {
          const snap = snaps[snaps.length - 1 - i]; // newest snapshot hydrates newest card
          const card = updated[i];
          if (card && !card.hydrated) {
            updated[i] = {
              ...card,
              ...snap,
              hydrated: true,
            };
          }
        }
        return updated;
      });
    }
  }, [inspector, lastSnapshotCount]);

  async function copyCard(c) {
    try {
      await navigator.clipboard.writeText(formatCardForCopy(c));
      setCopiedKey(c.key);
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
        {cards.length === 0 ? (
          <p className="mt-1 text-xs leading-5 text-slate-600">
            A preview will appear here as soon as the first snapshot is created.
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {cards.map((c) => (
              <div
                key={c.key}
                className="rounded-md border border-slate-200 p-2 text-xs leading-5 text-slate-700"
              >
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-slate-500">
                    turns {c.from_turn ?? "?"}–{c.to_turn ?? "?"} •{" "}
                    {new Date(c.created_at).toLocaleString()}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {c.confidence && (
                      <span className="text-[10px] rounded-full border px-1.5 py-0.5 text-slate-500">
                        {c.confidence}
                      </span>
                    )}
                    <button
                      onClick={() => copyCard(c)}
                      className="text-[11px] rounded-md border px-2 py-0.5 hover:bg-slate-50 active:scale-[0.99]"
                      title="Copy preview text"
                    >
                      {copiedKey === c.key ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                {c.topics?.length > 0 && (
                  <div className="mt-1">
                    <div className="font-medium">Topics</div>
                    <ul className="list-disc pl-4">
                      {c.topics.map((t, i) => (
                        <li key={i}>
                          <b>{t.slug}</b>
                          {t.gloss ? ` — ${t.gloss}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {c.key_details?.length > 0 && (
                  <div className="mt-1">
                    <div className="font-medium">Key details</div>
                    <ul className="list-disc pl-4">
                      {c.key_details.map((k, i) => (
                        <li key={i}>{k}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {c.decisions?.length > 0 && (
                  <div className="mt-1">
                    <div className="font-medium">Decisions</div>
                    <ul className="list-disc pl-4">
                      {c.decisions.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {c.open_questions?.length > 0 && (
                  <div className="mt-1">
                    <div className="font-medium">Open questions</div>
                    <ul className="list-disc pl-4">
                      {c.open_questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {c.actions?.length > 0 && (
                  <div className="mt-1">
                    <div className="font-medium">Actions</div>
                    <ul className="list-disc pl-4">
                      {c.actions.map((a, i) => (
                        <li key={i}>
                          {a.text}
                          {a.owner ? (
                            <span className="text-slate-500"> — {a.owner}</span>
                          ) : null}
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
