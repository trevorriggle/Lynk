"use client";
import { useState } from "react";

// Collapsible section with spec teal bar
function Section({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl !bg-[#176A82] text-white shadow-sm"   >
        <span className="font-semibold">{title}</span>
        <span
          className={`transition-transform select-none ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          ▸
        </span>
      </button>

      <div className={`transition-all overflow-hidden ${open ? "max-h-[600px] mt-2" : "max-h-0"}`}>
        <div className="rounded-xl border !border-[#C7EBEA]/60 bg-white p-3">
  <div className="space-y-2">
    {children}
  </div>
</div>
      </div>
    </div>
  );
}

function Row({ label, onClick, muted = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      "className":[
  "w-full text-left px-3 py-2.5 rounded-lg",
  "ring-1 ring-black/5",
  "!hover:bg-[#C7EBEA]/30 active:!bg-[#C7EBEA]/50",
  "hover:!border-[#C7EBEA]/60", // keep hover border accent
  …
].join(" ")

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
  return (
    // Rail: spec aqua
<aside className="h-full w-full lg:w-64 px-3 pb-3 pt-0 !bg-[#C7EBEA]">
      <Section title="Context Files">
        <Row
          label="sys-prompt.txt"
          onClick={() => onActivate?.({ type: "file", key: "sys-prompt.txt" })}
        />
        <Row
          label="Add More"
          onClick={() => onActivate?.({ type: "file", key: "upload" })}
          muted
        />
      </Section>

      <Section title="Behaviors">
        <Row
          label="Respond cordially and friendly."
          onClick={() => onActivate?.({ type: "behavior", key: "cordial" })}
        />
      </Section>

      <Section title="Commands">
        <Row
          label="Carolina?"
          onClick={() => onActivate?.({ type: "command", key: "carolina?" })}
        />
        <Row
          label="Fort-rapids?"
          onClick={() => onActivate?.({ type: "command", key: "fort-rapids?" })}
        />
        <Row
          label="Courses?"
          onClick={() => onActivate?.({ type: "command", key: "courses?" })}
        />
        <div className="pt-1">
          <Row
            label="See All"
            onClick={() => onActivate?.({ type: "command", key: "see-all" })}
            muted
          />
        </div>
      </Section>

      <Section title="Projects">
        <Row
          label="Carolina Research"
          onClick={() => onActivate?.({ type: "project", key: "carolina" })}
        />
        <Row
          label="Graphic Design"
          onClick={() => onActivate?.({ type: "project", key: "graphic-design" })}
        />
        <Row
          label="Coding Support"
          onClick={() => onActivate?.({ type: "project", key: "coding-support" })}
        />
      </Section>

      <Section title="Recent Chats">
        <Row
          label="Best Python Course"
          onClick={() => onActivate?.({ type: "recent", key: "best-python-course" })}
        />
        <Row
          label="Lunch Options"
          onClick={() => onActivate?.({ type: "recent", key: "lunch-options" })}
        />
      </Section>

      <div className="mt-4 text-sm text-slate-500 px-2">
        <span className="opacity-70">Lynk account</span>
      </div>
    </aside>
  );
}
