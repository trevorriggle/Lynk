// components/RightPanel.jsx - Fixed to show dummies based on auth status
"use client";

import { useEffect, useState } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

// build a fresh dummy card
function makeDummyCard(seqKey, userMessageCount) {
  const fromTurn = Math.max(1, ((userMessageCount - 1) * 2) - 8); // rough estimate
  const toTurn = userMessageCount * 2; // rough estimate including assistant responses
  
  return {
    key: String(seqKey),
    created_at: new Date().toISOString(),
    from_turn: fromTurn,
    to_turn: toTurn,
    confidence: "med",
    topics: [
      { slug: "conversation-topic", gloss: "key themes from recent discussion" },
      { slug: "user-interest", gloss: "areas of focus and questions" },
    ],
    key_details: [
      "Important information shared in recent messages",
      "Key facts or decisions discussed",
      "Notable preferences or requirements mentioned",
    ],
    decisions: ["Key decision or choice made in conversation"],
    open_questions: ["Questions still being explored"],
    actions: [{ text: "follow up on discussed topics", owner: "user" }],
    hydrated: false, // mark until snapshot merges
  };
}

// pretty plaintext for copy
function formatCardForCopy(c) {
  const lines = [];
  lines.push(
    `Turns ${c.from_turn ?? "?"}—${c.to_turn ?? "?"} • ${new Date(
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
  const [cards, setCards] = useState([]);
  const [copiedKey, setCopiedKey] = useState(null);
  const [lastUserMessageCount, setLastUserMessageCount] = useState(0);
  const [authState, setAuthState] = useState({ loading: true, authenticated: false });

  // Get active session and messages from store
  const { activeId, sessions, guestMessageCount } = useSessionStore((s) => ({
    activeId: s.activeId,
    sessions: s.sessions,
    guestMessageCount: s.guestMessageCount
  }));

  // Check auth status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        if (r.ok) {
          const data = await r.json();
          setAuthState({
            loading: false,
            authenticated: !!data.userId,
          });
        } else {
          setAuthState({
            loading: false,
            authenticated: false,
          });
        }
      } catch {
        setAuthState({
          loading: false,
          authenticated: false,
        });
      }
    };
    checkAuth();
  }, []);

  // Get current thread and count user messages
  const currentThread = activeId ? sessions[activeId]?.messages || [] : [];
  const threadUserMessageCount = currentThread.filter(m => m?.role === "user").length;
  
  // Use appropriate message count based on auth status
  const currentUserMessageCount = authState.authenticated ? threadUserMessageCount : Math.floor(guestMessageCount / 2); // Convert guest total to user messages

  // Listen for inspector updates from backend
  useEffect(() => {
    function onUpdate(e) {
      if (e?.detail) {
        console.log("RightPanel received inspector update:", e.detail);
        setInspector(e.detail);
      }
    }
    window.addEventListener("inspector:update", onUpdate);
    return () => window.removeEventListener("inspector:update", onUpdate);
  }, []);

  // Poll backend for inspector data
  useEffect(() => {
    if (!activeId) {
      setInspector(null);
      setCards([]);
      setLastUserMessageCount(0);
      return;
    }

    const load = async () => {
      try {
        const r = await fetch(`/api/session?sessionId=${encodeURIComponent(activeId)}`);
        const j = await r.json();
        if (j?.inspector) {
          setInspector(j.inspector);
        }
      } catch (e) {
        console.warn("RightPanel polling error:", e);
      }
    };
    
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [activeId]);

  // Generate dummy cards based on auth status and message count
  useEffect(() => {
    if (!activeId || currentUserMessageCount === 0 || authState.loading) {
      if (lastUserMessageCount > 0) {
        // Session changed, reset
        setCards([]);
        setLastUserMessageCount(0);
      }
      return;
    }

    // Different snapshot thresholds based on auth status
    const snapshotInterval = authState.authenticated ? 5 : 2; // Every 5 for auth, every 2 for guests
    const expectedSnapshots = Math.floor(currentUserMessageCount / snapshotInterval);
    const currentSnapshots = cards.length;

    console.log("RightPanel: userMessages =", currentUserMessageCount, "expected =", expectedSnapshots, "current =", currentSnapshots, "auth =", authState.authenticated);

    if (expectedSnapshots > currentSnapshots) {
      // Need to add new dummy cards
      const newCards = [];
      for (let i = currentSnapshots; i < expectedSnapshots; i++) {
        const snapshotNumber = i + 1;
        const seqKey = `snapshot-${snapshotNumber}-${Date.now()}`;
        const userCountForThisSnapshot = (i + 1) * snapshotInterval; // 5,10,15 for auth or 2,4,6 for guests
        newCards.push(makeDummyCard(seqKey, userCountForThisSnapshot));
      }
      
      setCards(prev => [...newCards, ...prev]); // newest first
      console.log("RightPanel: Added", newCards.length, "new dummy cards");
      
    } else if (expectedSnapshots < currentSnapshots) {
      // Too many cards, trim to expected count
      setCards(prev => prev.slice(0, expectedSnapshots));
      console.log("RightPanel: Trimmed cards to", expectedSnapshots);
    }

    setLastUserMessageCount(currentUserMessageCount);
  }, [activeId, currentUserMessageCount, cards.length, lastUserMessageCount, authState.authenticated, authState.loading]);

  // Hydrate dummy cards with real snapshot data when available
  useEffect(() => {
    const snaps = inspector?.snapshots || [];
    
    if (snaps.length > 0 && cards.length > 0) {
      setCards(prev => {
        const updated = [...prev];
        
        // Hydrate cards with real snapshot data (newest snapshot goes to newest card)
        for (let i = 0; i < Math.min(snaps.length, updated.length); i++) {
          const snap = snaps[snaps.length - 1 - i]; // newest snapshot first
          const card = updated[i]; // newest card first
          
          if (card && !card.hydrated) {
            updated[i] = {
              ...card,
              ...snap,
              key: card.key, // preserve the dummy key
              hydrated: true,
            };
            console.log("RightPanel: Hydrated card", i, "with real snapshot data");
          }
        }
        
        return updated;
      });
    }
  }, [inspector?.snapshots, cards.length]);

  async function copyCard(c) {
    try {
      await navigator.clipboard.writeText(formatCardForCopy(c));
      setCopiedKey(c.key);
      setTimeout(() => setCopiedKey(null), 1200);
    } catch {
      console.warn("Failed to copy card to clipboard");
    }
  }

  return (
    <aside className="hidden w-80 shrink-0 lg:block px-4 pb-4 pt-0">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-[10px] text-slate-400">
          session: <code>{activeId || "—"}</code> • user messages: {currentUserMessageCount} • auth: {authState.authenticated ? "yes" : "no"}
        </div>

        <div className="mb-1 text-sm font-semibold text-slate-800">Previews</div>
        {cards.length === 0 ? (
          <p className="mt-1 text-xs leading-5 text-slate-600">
            A preview will appear here as soon as the first snapshot is created.
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {cards.map((c, index) => (
              <div
                key={c.key}
                className={`rounded-md border p-2 text-xs leading-5 transition-colors ${
                  c.hydrated 
                    ? "border-green-200 bg-green-50 text-slate-700" 
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[11px] text-slate-500">
                    turns {c.from_turn ?? "?"}—{c.to_turn ?? "?"} • {new Date(c.created_at).toLocaleString()}
                    {!c.hydrated && <span className="ml-2 text-orange-500">(generating...)</span>}
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