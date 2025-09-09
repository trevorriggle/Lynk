{/* Suggestions - Always show for debugging */}
{true && (
  <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
    <div className="mb-2 flex items-center justify-between">
      <div className="text-xs font-semibold text-indigo-700">
        Suggestions (Commands: {commands.length})
      </div>
      <button
        onClick={() => sendToRegistry(commands)}
        className="text-[10px] rounded-md border border-indigo-400 bg-indigo-600 text-white px-2 py-1 hover:bg-indigo-700 active:scale-[0.99] font-medium"
        title="Send all commands to registry"
      >
        {copiedKey === "registry-success" ? "Sent!" : "Send to Registry"}
      </button>
    </div>
    
    {commands.length === 0 ? (
      <div className="text-xs text-slate-500">
        No commands found. Inspector data: {inspector ? "loaded" : "null"}
      </div>
    ) : (
      <div className="flex flex-wrap gap-1">
        {commands.slice().reverse().slice(0, 10).map((c, i) => (
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
    )}
  </div>
)}