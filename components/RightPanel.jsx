"use client";
export default function RightPanel({ active, state = "Inactive" }) {
  return (
    <aside className="hidden w-80 shrink-0 border-l border-zinc-800 p-4 lg:block">
      <div className="rounded-2xl border border-zinc-800 p-4">
        <div className="mb-2 text-xs text-zinc-400">State</div>
        <div className="mb-4 rounded-lg bg-zinc-900 px-3 py-2 text-sm">{state}</div>
        <div className="text-sm text-zinc-400">Panel: {active}</div>
        <p className="mt-3 text-xs text-zinc-500">
          This inspector lights up when you pick a Project/Command or attach Context Files.
        </p>
      </div>
    </aside>
  );
}
