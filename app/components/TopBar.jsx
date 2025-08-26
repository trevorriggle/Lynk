"use client";

/**
 * Lynk TopBar
 * - Clean, compact white bar with teal accent badge
 * - Poppins headings, subtle divider, no gray fill anywhere
 * - Left: brand, project switcher; Center: search; Right: quick actions
 * - Responsive: search collapses on small screens
 *
 * Z-order note: z-[10000]; keep DraggableModelButton at z-[10001]+.
 */
export default function TopBar({
  project = "Workspace",
  onNewChat,
  onUpload,
  onSettings,
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-[10000] h-12 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-slate-200">
      <div className="mx-auto max-w-screen-2xl h-full px-3 sm:px-4 flex items-center gap-3">
        {/* Brand / Identity */}
        <div className="flex items-center gap-2 min-w-0">
          {/* Teal accent puck */}
          <span className="inline-block h-6 w-6 rounded-full bg-brand-teal/10 border border-brand-teal/30" />
          {/* Wordmark */}
          <span className="text-sm font-heading font-black text-brand-teal tracking-tight select-none">
            Lynk
          </span>

          {/* Project switcher */}
          <div className="hidden sm:flex items-center gap-1 pl-3 ml-2 border-l border-slate-200">
            <span className="text-xs text-slate-500">Project</span>
            <button
              type="button"
              className="ml-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs bg-brand-teal/10 text-brand-teal hover:bg-brand-teal/15 active:bg-brand-teal/20"
              onClick={() => {/* hook up later */}}
            >
              <span className="truncate max-w-[12ch]">{project}</span>
              <span className="select-none">▾</span>
            </button>
          </div>
        </div>

        {/* Center search (collapses on xs) */}
        <div className="flex-1 min-w-0 hidden md:flex">
          <div className="relative w-full max-w-xl">
            <input
              type="search"
              placeholder="Search files, chats, and commands…"
              className="w-full rounded-full border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-brand-teal"
            />
            <svg
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
              width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"
            >
              <path d="M10 18a8 8 0 1 1 5.293-14.293A8 8 0 0 1 10 18Zm11 3-6-6"
                fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onNewChat}
            className="hidden sm:inline-flex items-center rounded-full bg-brand-teal text-white text-xs font-medium px-3 py-2 hover:opacity-95 active:opacity-90"
          >
            New Chat
          </button>
          <button
            type="button"
            onClick={onUpload}
            className="inline-flex items-center rounded-full border border-slate-200 text-xs px-3 py-2 hover:bg-slate-50 active:bg-slate-100"
          >
            Upload
          </button>
          <button
            type="button"
            onClick={onSettings}
            className="inline-flex items-center rounded-full border border-slate-200 text-xs px-3 py-2 hover:bg-slate-50 active:bg-slate-100"
          >
            Settings
          </button>
        </div>
      </div>
    </header>
  );
}
