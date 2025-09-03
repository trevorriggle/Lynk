"use client";
import { useState, useMemo } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

// Collapsible section with spec teal bar
function Section({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl !bg-[#176A82] text-white shadow-sm"
      >
        <span className="font-semibold">{title}</span>
        <span className={`transition-transform select-none ${open ? "rotate-90" : ""}`} aria-hidden>
          ▸
        </span>
      </button>

      <div className={`transition-all overflow-hidden ${open ? "max-h-[600px] mt-2" : "max-h-0"}`}>
        <div className="rounded-xl border !border-[#C7EBEA]/60 bg-white pt-4 px-3 pb-3">
          <div className="space-y-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, onClick, muted = false, active = false, pill = false }) {
  // EXACTLY match your chat input field visual
  // input classes: rounded-full border border-slate-300 bg-white px-4 py-3 text-slate-800 focus:ring-2 focus:ring-[#176A82]
  const baseInput =
    "w-full rounded-full bg-white px-4 py-3 text-base leading-6 text-slate-800 " +
    "transition outline-none select-none";

  const inactive =
    "border border-slate-300 hover:border-[#176A82] hover:ring-1 hover:ring-[#176A82]/30";

  const activeCls =
    "border-2 border-[#176A82] ring-2 ring-[#176A82]/40 " +
    "shadow-[inset_0_0_0_1px_rgba(23,106,130,0.20)] font-medium";

  const nonPill =
    "px-3 py-2.5 rounded-lg ring-1 ring-black/5 hover:bg-white/70";

  const cls = pill
    ? [baseInput, active ? activeCls : inactive, muted ? "text-slate-500 italic" : ""].join(" ")
    : [nonPill, active ? "bg-white border font-semibold shadow" : "", muted ? "text-slate-500 italic" : ""].join(" ");

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cls}
      title={label}
    >
      {label}
    </button>
  );
}


  if (muted) cls += " text-slate-500 italic";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cls}
      title={label}
    >
      {label}
    </button>
  );
}

/**
 * LeftStack
 * onActivate(ctx) -> { type: "command"|"project"|"file"|"behavior"|"recent", key: string }
 */
export default function LeftStack({ onActivate }) {
  const { order, sessions, activeId, selectSession, createSession } = useSessionStore((s) => s);
  const recent = useMemo(() => order.map((id) => sessions[id]).filter(Boolean), [order, sessions]);

  return (
    // Rail: spec aqua, no top gap
    <aside className="h-full w-full lg:w-64 px-3 pb-3 pt-4 !bg-[#C7EBEA]">
      <Section title="Context Files">
        <Row label="sys-prompt.txt" onClick={() => onActivate?.({ type: "file", key: "sys-prompt.txt" })} />
        <Row label="Add More" onClick={() => onActivate?.({ type: "file", key: "upload" })} muted />
      </Section>

      <Section title="Behaviors">
        <Row label="Respond cordially and friendly." onClick={() => onActivate?.({ type: "behavior", key: "cordial" })} />
      </Section>

      <Section title="Commands">
        <Row label="Carolina?" onClick={() => onActivate?.({ type: "command", key: "carolina?" })} />
        <Row label="Fort-rapids?" onClick={() => onActivate?.({ type: "command", key: "fort-rapids?" })} />
        <Row label="Courses?" onClick={() => onActivate?.({ type: "command", key: "courses?" })} />
        <div className="pt-1">
          <Row label="See All" onClick={() => onActivate?.({ type: "command", key: "see-all" })} muted />
        </div>
      </Section>

      <Section title="Projects">
        <Row label="Carolina Research" onClick={() => onActivate?.({ type: "project", key: "carolina" })} />
        <Row label="Graphic Design" onClick={() => onActivate?.({ type: "project", key: "graphic-design" })} />
        <Row label="Coding Support" onClick={() => onActivate?.({ type: "project", key: "coding-support" })} />
      </Section>

      {/* REAL Recent Chats */}
      <Section title="Recent Chats" defaultOpen>
  {recent.length === 0 ? (
    <Row label="(no chats yet)" muted pill />
  ) : (
    recent.map((s) => (
      <Row
        key={s.id}
        label={s.title || "New chat"}
        active={s.id === activeId}
        onClick={() => selectSession(s.id)}
        pill
      />
    ))
  )}
</Section>


      <div className="mt-4 text-sm text-slate-500 px-2">
        <span className="opacity-70">Lynk account</span>
      </div>
    </aside>
  );
}
