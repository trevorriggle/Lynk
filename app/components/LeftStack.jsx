"use client";
const items = [
  "Context Files",
  "Behaviors",
  "Commands",
  "Projects",
  "Recent Chats",
  "Transcript",
  "Cross-Reference",
  "Lynk account"
];

export default function LeftStack({ active, setActive }) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-zinc-800 p-3 md:block">
      <div className="space-y-1">
        {items.map((x) => (
          <button
            key={x}
            onClick={() => setActive(x)}
            className={
              "w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-zinc-900 " +
              (active === x ? "bg-zinc-900 ring-1 ring-zinc-700" : "")
            }
          >
            {x}
          </button>
        ))}
      </div>
    </aside>
  );
}
