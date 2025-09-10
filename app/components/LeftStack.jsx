"use client";
import { useState, useMemo, useRef } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

// File upload component for Context Files section
function FileUpload({ onFileUpload, onClose }) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const handleFiles = (files) => {
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        onFileUpload({
          key: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          label: file.name,
          content: e.target.result,
          type: file.type,
          size: file.size
        });
      };
      reader.readAsText(file);
    });
    onClose();
  };

  return (
    <div className="mb-2 p-3 border-2 border-dashed border-[#176A82] rounded-xl bg-white/50">
      <div 
        className={`p-4 rounded-lg transition-colors ${
          isDragging ? 'bg-[#176A82]/10' : 'bg-gray-50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="text-center">
          <div className="text-sm text-gray-600 mb-2">
            Drag files here or click to browse
          </div>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1 bg-[#176A82] text-white rounded-lg text-sm hover:opacity-90"
            >
              Browse Files
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1 bg-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Supports: .txt, .md, .json, .csv, .js, .py
          </div>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.md,.json,.csv,.js,.py,.jsx,.tsx,.ts"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}

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

export default function EnhancedLeftStack({ onActivate }) {
  const [showFileUpload, setShowFileUpload] = useState(false);
  
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
    addContextFile,
  } = useSessionStore((s) => s);

  const recent = useMemo(() => order.map((id) => sessions[id]).filter(Boolean), [order, sessions]);

  const handleFileUpload = (fileData) => {
    addContextFile(fileData);
    setShowFileUpload(false);
  };

  return (
    <aside className="h-full w-full lg:w-64 px-3 pb-3 pt-4 !bg-[#C7EBEA]">
      <Section title="Context Files" defaultOpen={true}>
        {showFileUpload && (
          <FileUpload 
            onFileUpload={handleFileUpload}
            onClose={() => setShowFileUpload(false)}
          />
        )}
        
        {contextFiles.map(file => (
          <Row 
            key={file.key}
            label={file.label} 
            onClick={() => onActivate?.({ type: "file", key: file.key, data: file })}
            onDelete={() => deleteContextFile(file.key)}
            deletable
          />
        ))}
        
        <Row 
          label="+ Upload Files" 
          onClick={() => setShowFileUpload(true)} 
          muted 
        />
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
        <Row 
          label="+ Add Behavior" 
          onClick={() => onActivate?.({ type: "behavior", key: "add-new" })} 
          muted 
        />
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
        <Row 
          label="+ New Project" 
          onClick={() => onActivate?.({ type: "project", key: "add-new" })} 
          muted 
        />
      </Section>

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