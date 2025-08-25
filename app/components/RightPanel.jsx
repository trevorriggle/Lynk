"use client";

export default function RightPanel({ panelTitle, panelSummary, state = "Inactive" }) {
  const active = state !== "Inactive";
  return (
    <aside className="hidden w-80 shrink-0 border-l border-zinc-800 p-4 lg:block">
      <div className="rounded-2xl border border-zinc-800 p-4">
        <div className="mb-2 text-xs text-zinc-400">State</div>
        <div
          className={
            "mb-4 rounded-lg px-3 py-2 text-sm " +
            (active ? "bg-emerald-900/20 border border-emerald-700/30" : "bg-zinc-900")
          }
        >
          {state}
        </div>

        <div className="text-sm text-zinc-300 font-medium">
          {panelTitle || "Panel"}
        </div>
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          {panelSummary || "This inspector lights up when you pick a Project/Command or attach Context Files."}
        </p>
      </div>
    </aside>
  );
}
