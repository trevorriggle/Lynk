  // Use appropriate message count
  const currentUserMessageCount = authState.authenticated ? threadUserMessageCount : guestMessageCount;

  // Listen for inspector updates from backend
  useEffect(() => {
    function onUpdate(e) {
      if (e?.detail) {
        console.log("RightPanel received inspector update:", e.detail);
        setInspector(e.detail);
        // Hide dummy when real data arrives
        if (e.detail?.snapshots?.length > 0) setShowDummy(false);
      }
    }
    window.addEventListener("inspector:update", onUpdate);
    return () => window.removeEventListener("inspector:update", onUpdate);
  }, []);

  // Poll backend for inspector data
  useEffect(() => {
    if (!activeId) {
      setInspector(null);
      setShowDummy(true);
      return;
    }

    const load = async () => {
      try {
        const r = await fetch(`/api/session?sessionId=${encodeURIComponent(activeId)}`);
        const j = await r.json();
        if (j?.inspector) {
          setInspector(j.inspector);
          if (j.inspector?.snapshots?.length > 0) setShowDummy(false);
        }
      } catch (e) {
        console.warn("RightPanel polling error:", e);
      }
    };

    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [activeId]);

  // Copy function for individual sections
  async function copySection(content, sectionKey) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedKey(sectionKey);
      setTimeout(() => setCopiedKey(null), 1200);
    } catch {
      console.warn("Failed to copy section to clipboard");
    }
  }

  // Copy all sections function
  function copyAllSections(c, index) {
    const sections = [];

    if (c.topics?.length > 0) {
      sections.push("Topics:");
      sections.push(...c.topics.map((t) => `• ${t.slug}${t.gloss ? ` — ${t.gloss}` : ""}`));
      sections.push("");
    }

    if (c.key_details?.length > 0) {
      sections.push("Key Details:");
      sections.push(...c.key_details.map((k) => `• ${k}`));
      sections.push("");
    }

    if (c.decisions?.length > 0) {
      sections.push("Decisions:");
      sections.push(...c.decisions.map((d) => `• ${d}`));
      sections.push("");
    }

    if (c.open_questions?.length > 0) {
      sections.push("Open Questions:");
      sections.push(...c.open_questions.map((q) => `• ${q}`));
      sections.push("");
    }

    if (c.actions?.length > 0) {
      sections.push("Actions:");
      sections.push(
        ...c.actions.map((a) => {
          const actionText = typeof a === "string" ? a : a.text;
          const owner = a.owner ? ` (${a.owner})` : "";
          return `• ${actionText}${owner}`;
        })
      );
    }

    copySection(sections.join("\n").trim(), `all-${index}`);
  }

  // Get snapshots & commands (commands fire at 3/6/9… mentions)
  const snapshots = inspector?.snapshots || [];
  const commands = inspector?.commands || [];

  // Dummy preview (only when no real snapshots exist at 5th, 10th, … user message)
  const dummyPreview = {
    created_at: new Date().toISOString(),
    from_turn: 1,
    to_turn: currentUserMessageCount,
    topics: [
      { slug: "conversation-preview", gloss: "Example of how topics will appear" },
      { slug: "ai-assistance", gloss: "Discussion about AI capabilities" },
    ],
    key_details: [
      "This is a sample preview showing how conversation summaries work",
      "Previews appear automatically every 5 messages",
      "Each section can be copied individually or all together",
    ],
    decisions: ["User decided to explore the preview functionality"],
    open_questions: ["How will the real conversation data look?", "What other features are available?"],
    actions: [
      { text: "Try the copy buttons above", owner: "user" },
      { text: "Continue chatting to generate real previews", owner: "system" },
    ],
    confidence: "high",
  };

  const hasRealSnapshots = snapshots.length > 0;
  const shouldHaveSnapshots = currentUserMessageCount >= 5 && currentUserMessageCount % 5 === 0;
  const shouldShowDummy = showDummy && !hasRealSnapshots && shouldHaveSnapshots && snapshots.length === 0;
  const previewsToShow = hasRealSnapshots ? snapshots : shouldShowDummy ? [dummyPreview] : [];

  return (
    <aside className="hidden w-80 shrink-0 lg:block px-4 pb-4 pt-0">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-[10px] text-slate-400">
          session: <code>{activeId || "—"}</code> • user messages: {currentUserMessageCount} • auth:{" "}
          {authState.authenticated ? "yes" : "no"} • snapshots: {snapshots.length} • commands: {commands.length}
        </div>

        {/* Suggestions */}
        {commands.length > 0 && (
          <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
            <div className="mb-1 text-xs font-semibold text-indigo-700">Suggestions</div>
            <div className="flex flex-wrap gap-1">
              {commands
                .slice()
                .reverse()
                .slice(0, 10)
                .map((c, i) => (
                  <button
                    key={(c.created_at || "") + i}
                    onClick={() => copySection(c.command, `cmd-${i}`)}
                    className="text-[10px] rounded-md border border-indigo-300 bg-white px-2 py-1 hover:bg-indigo-100 active:scale-[0.99]"
                    title={`Copy "${c.command}"`}
                  >
                    {c.slug}? {copiedKey === `cmd-${i}` ? "✓" : ""}
                  </button>
                ))}
            </div>
          </div>
        )}

        <div className="mb-1 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-800">Previews</div>
          {shouldShowDummy && (
            <button
              onClick={() => setShowDummy(false)}
              className="text-[10px] text-slate-500 hover:text-slate-700"
              title="Hide dummy preview"
            >
              Hide Demo
            </button>
          )}
        </div>

        {previewsToShow.length === 0 ? (
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Previews will appear here after every 5 messages as the AI creates conversation snapshots.
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {previewsToShow
              .slice()
              .reverse()
              .map((c, index) => (
                <div
                  key={c.created_at + index}
                  className={`rounded-md border p-2 text-xs leading-5 text-slate-700 ${
                    shouldShowDummy && !hasRealSnapshots ? "border-blue-200 bg-blue-50" : "border-green-200 bg-green-50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[11px] text-slate-500">
                      {shouldShowDummy && !hasRealSnapshots ? (
                        <span className="text-blue-600 font-medium">Demo Preview</span>
                      ) : (
                        <>
                          turns {c.from_turn ?? "?"}—{c.to_turn ?? "?"} • {new Date(c.created_at).toLocaleString()}
                        </>
                      )}
                    </div>
                    <button
                      onClick={() => copyAllSections(c, index)}
                      className="text-[11px] rounded-md border px-2 py-0.5 hover:bg-slate-100 active:scale-[0.99] font-medium"
                      title="Copy all sections"
                    >
                      {copiedKey === `all-${index}` ? "Copied!" : "Copy All"}
                    </button>
                  </div>

                  {!shouldShowDummy &&
                    hasRealSnapshots &&
                    !c.topics?.length &&
                    !c.key_details?.length &&
                    !c.decisions?.length && (
                      <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-[10px]">
                        <div className="font-medium text-yellow-800">Debug - Empty Snapshot:</div>
                        <pre className="text-yellow-700 mt-1 whitespace-pre-wrap">{JSON.stringify(c, null, 2)}</pre>
                      </div>
                    )}

                  {c.topics?.length > 0 && (
                    <div className="mt-1">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">Topics</div>
                        <button
                          onClick={() => {
                            const topicsText = c.topics
                              .map((t) => `• ${t.slug}${t.gloss ? ` — ${t.gloss}` : ""}`)
                              .join("\n");
                            copySection(topicsText, `topics-${index}`);
                          }}
                          className="text-[10px] rounded border px-1.5 py-0.5 hover:bg-slate-100 active:scale-[0.99]"
                          title="Copy topics"
                        >
                          {copiedKey === `topics-${index}` ? "Copied!" : "Copy"}
                        </button>
                      </div>
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
                      <div className="flex items-center justify-between">
                        <div className="font-medium">Key details</div>
                        <button
                          onClick={() => {
                            const detailsText = c.key_details.map((k) => `• ${k}`).join("\n");
                            copySection(detailsText, `details-${index}`);
                          }}
                          className="text-[10px] rounded border px-1.5 py-0.5 hover:bg-slate-100 active:scale-[0.99]"
                          title="Copy key details"
                        >
                          {copiedKey === `details-${index}` ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <ul className="list-disc pl-4">
                        {c.key_details.map((k, i) => (
                          <li key={i}>{k}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {c.decisions?.length > 0 && (
                    <div className="mt-1">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">Decisions</div>
                        <button
                          onClick={() => {
                            const decisionsText = c.decisions.map((d) => `• ${d}`).join("\n");
                            copySection(decisionsText, `decisions-${index}`);
                          }}
                          className="text-[10px] rounded border px-1.5 py-0.5 hover:bg-slate-100 active:scale-[0.99]"
                          title="Copy decisions"
                        >
                          {copiedKey === `decisions-${index}` ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <ul className="list-disc pl-4">
                        {c.decisions.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {c.open_questions?.length > 0 && (
                    <div className="mt-1">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">Open questions</div>
                        <button
                          onClick={() => {
                            const questionsText = c.open_questions.map((q) => `• ${q}`).join("\n");
                            copySection(questionsText, `questions-${index}`);
                          }}
                          className="text-[10px] rounded border px-1.5 py-0.5 hover:bg-slate-100 active:scale-[0.99]"
                          title="Copy open questions"
                        >
                          {copiedKey === `questions-${index}` ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <ul className="list-disc pl-4">
                        {c.open_questions.map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {c.actions?.length > 0 && (
                    <div className="mt-1">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">Actions</div>
                        <button
                          onClick={() => {
                            const actionsText = c.actions
                              .map((a) => {
                                const actionText = typeof a === "string" ? a : a.text;
                                const owner = a.owner ? ` (${a.owner})` : "";
                                return `• ${actionText}${owner}`;
                              })
                              .join("\n");
                            copySection(actionsText, `actions-${index}`);
                          }}
                          className="text-[10px] rounded border px-1.5 py-0.5 hover:bg-slate-100 active:scale-[0.99]"
                          title="Copy actions"
                        >
                          {copiedKey === `actions-${index}` ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <ul className="list-disc pl-4">
                        {c.actions.map((a, i) => (
                          <li key={i}>
                            {typeof a === "string" ? a : a.text}
                            {a.owner ? <span className="text-slate-500"> — {a.owner}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {shouldShowDummy && !hasRealSnapshots && (
                    <div className="mt-2 pt-2 border-t border-blue-200">
                      <p className="text-[10px] text-blue-600">
                        This is a demo preview. Real conversation summaries will replace this after 5+ messages.
                      </p>
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
