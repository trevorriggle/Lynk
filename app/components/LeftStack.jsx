"use client";

const items = [
  "Context Files",
  "Behaviors",
  "Commands",
  "Projects",
  "Recent Chats",
  "Transcript",
  "Cross-Reference",
  "Lynk account",
];

export default function LeftStack({ active, setActive }) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-zinc-800 p-3 md:block">
      <nav className="space-y-1">
        {items.map((x) => {
          const selected = active === x;
          return (
            <button
              key={x}
              onClick={() => setActive(x)}
              className={
                "w-full rounded-xl px-3 py-2 text-left text-sm transition " +
                (selected ? "bg-zinc-900 ring-1 ring-zinc-700" : "hover:bg-zinc-900")
              }
            >
              {x}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
