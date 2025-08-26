"use client";

export default function RightPanel({ active = false, activeContext = null }) {
  const state = active ? "Active" : "Inactive";
  return (
   <aside className="hidden w-80 shrink-0 lg:block px-4 pb-4 pt-0">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-xs text-slate-500">State</div>
        <div
          className={
            "mb-4 rounded-lg px-3 py-2 text-sm " +
            (active ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                    : "bg-slate-50 border border-slate-200 text-slate-600")
          }
        >
          {state}
        </div>

        <div className="text-sm text-slate-800 font-medium">
          {activeContext?.type ? "Panel" : "Panel"}
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          {activeContext
            ? JSON.stringify(activeContext)
            : "This inspector lights up when you pick a Project/Command or attach Context Files."}
        </p>
      </div>
    </aside>
  );
}
