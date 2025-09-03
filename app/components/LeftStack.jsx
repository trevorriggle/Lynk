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
  // Base
  let cls =
    "relative w-full text-left transition outline-none select-none";

  // Size/typography
  cls += " text-[15px] leading-6";

  if (pill) {
    // Match the chat input pill
    // height ≈ input, rounded-full, double-outline vibe
    cls += " h-[52px] rounded-full px-4"; // adjust to h-[56px] if your input is taller
    cls += active
      ? " bg-white text-slate-900 border-2 border-[#176A82] ring-2 ring-[#176A82]/40 shadow-[inset_0_0_0_1px_rgba(23,106,130,0.25)]"
      : " bg-white/80 text-slate-800 border border-slate-300 hover:bg-white focus-visible:ring-2 focus-visible:ring-[#176A82]/40";
  } else {
    // Original card-ish style for non-chat rows
    cls += " px-3 py-2.5 rounded-lg ring-1 ring-black/5";
    cls += active
      ? " bg-white border font-semibold shadow outline outline-2 outline-[#C7EBEA]/70"
      : " !hover:bg-[#C7EBEA]/30 active:!bg-[#C7EBEA]/50 hover:!border-[#C7EBEA]/60";
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
          <>
            <Row label="(no chats yet)" muted />
            <Row
              label="Start a new chat"
              onClick={() => createSession({ label: "Claude", provider: "anthropic", model: "claude-3-haiku-20240307" })}
            />
          </>
        ) : (
          recent.map((s) => (
            <Row
              key={s.id}
              label={s.title || "New chat"}
              active={s.id === activeId}
              onClick={() => selectSession(s.id)}
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
