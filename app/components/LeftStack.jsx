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
        <span
          className={`transition-transform select-none ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
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

/** Row that can render as an input-like pill when `pill` is true */
function Row({ label, onClick, onDelete, muted = false, active = false, pill = false, deletable = false }) {
  // EXACT match to your chat input pill styles
  const pillBase =
    "w-full rounded-full bg-white px-4 py-3 text-base leading-4 text-slate-800 transition outline-none select-none truncate";
  const pillInactive =
    "border border-slate-300 hover:border-[#176A82] hover:ring-1 hover:ring-[#176A82]/30";
  const pillActive =
    "border-2 border-[#176A82] ring-2 ring-[#176A82]/40 shadow-[inset_0_0_0_1px_rgba(23,106,130,0.20)] font-medium";

  const nonPillBase =
    "w-full text-left px-3 py-2.5 rounded-lg ring-1 ring-black/5 transition truncate";
  const nonPillInactive =
    "!hover:bg-[#C7EBEA]/30 active:!bg-[#C7EBEA]/50 hover:!border-[#C7EBEA]/60";
  const nonPillActive = "bg-white border font-semibold shadow";

  const cls = pill
    ? [pillBase, active ? pillActive : pillInactive, muted ? "text-slate-500 italic" : ""].join(" ")
    : [nonPillBase, active ? nonPillActive : nonPillInactive, muted ? "text-slate-500 italic" : "text-slate-800"].join(" ");

  if (deletable) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={onClick}
          aria-current={active ? "true" : undefined}
          className={cls}
          title={label}
        >
          {label}
        </button>
        <button
          type="button"
          title="Delete"
          aria-label="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#176A82] hover:opacity-80 text-2xl leading-none"
        >
          ×
        </button>
      </div>
    );
  }

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

export default function LeftStack({ onActivate }) {
  const {
    order,
    sessions,
    activeId,
    selectSession,
    createSession,
    deleteSession,
    contextFiles = [],
    behaviors = [],
    commands = [],
    projects = [],
    deleteContextFile,
    deleteBehavior,
    deleteCommand,
    deleteProject,
  } = useSessionStore((s) => s);

  const recent = useMemo(() => order.map((id) => sessions[id]).filter(Boolean), [order, sessions]);

  return (
    <aside className="h-full w-full lg:w-64 px-3 pb-3 pt-4 !bg-[#C7EBEA]">
      <Section title="Context Files">
        {contextFiles.map(file => (
          <Row 
            key={file.key}
            label={file.label} 
            onClick={() => onActivate?.({ type: "file", key: file.key })}
            onDelete={() => deleteContextFile(file.key)}
            deletable
          />
        ))}
        <Row label="Add More" onClick={() => onActivate?.({ type: "file", key: "upload" })} muted />
      </Section>

      <Section title="Behaviors">
        {behaviors.map(behavior => (
          <Row 
            key={behavior.key}
            label={behavior.label} 
            onClick={() => onActivate?.({ type: "behavior", key: behavior.key })}
            onDelete={() => deleteBehavior(behavior.key)}
            deletable
          />
        ))}
      </Section>

      <Section title="Commands">
        {commands.map(command => (
          <Row 
            key={command.key}
            label={command.label} 
            onClick={() => onActivate?.({ type: "command", key: command.key })}
            onDelete={() => deleteCommand(command.key)}
            deletable
          />
        ))}
        <div className="pt-1">
          <Row label="See All" onClick={() => onActivate?.({ type: "command", key: "see-all" })} muted />
        </div>
      </Section>

      <Section title="Projects">
        {projects.map(project => (
          <Row 
            key={project.key}
            label={project.label} 
            onClick={() => onActivate?.({ type: "project", key: project.key })}
            onDelete={() => deleteProject(project.key)}
            deletable
          />
        ))}
      </Section>

      {/* Recent Chats - now defaultOpen=false (collapsed by default) */}
      <Section title="Recent Chats" defaultOpen={false}>
        {recent.length === 0 ? (
          <Row label="(no chats yet)" muted pill />
        ) : (
          recent.map((s) => {
            const active = s.id === activeId;
            return (
              <div key={s.id} className="relative">
                <Row
                  label={s.title || "New chat"}
                  active={active}
                  onClick={() => selectSession(s.id)}
                  pill
                />
                <button
                  type="button"
                  title="Delete chat"
                  aria-label="Delete chat"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(s.id);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#176A82] hover:opacity-80 text-2xl leading-none"
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </Section>
    </aside>
  );
}