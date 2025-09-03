"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

/** Model choices for the floating pill */
const MODELS = [
  { label: "Claude", provider: "anthropic", model: "claude-3-haiku-20240307", endpoint: "/api/session", icon: "/anthropic-logo.png" },
  { label: "OpenAI", provider: "openai", model: "gpt-4o-mini", endpoint: "/api/session", icon: "/OpenAI-Logo.png" },
  { label: "Gemini", provider: "gemini", model: "gemini-1.5-flash", endpoint: "/api/session", icon: "/google-logo.png" },
  { label: "Grok",   provider: "xai",     model: "grok-2",               endpoint: "/api/session", icon: "/xai-logo.png" },
];

const STORAGE_KEY = "lynk_pill_pos_v10";
const CLICK_DRAG_THRESHOLD = 6;
const PILL_W = 192;
const PILL_H = 48;
const EDGE = 8;

export default function DraggableModelButton({ model, setModel }) {
  const initial = useMemo(
    () => (typeof model === "string" ? model : model?.label) || "Claude",
    [model]
  );

  const [current, setCurrent] = useState(initial);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState({ x: 24, y: 160 });

  const setSelectedModel = useSessionStore((s) => s.setSelectedModel);

  const wrapRef = useRef(null);
  const press = useRef({ x: 0, y: 0, moved: 0, offX: 0, offY: 0 });

  // Lift selection to parent AND store (store also updates active session's model)
  useEffect(() => {
    const selected = MODELS.find((m) => m.label === current) || MODELS[0];
    setModel?.(selected);
    setSelectedModel(selected);
  }, [current, setModel, setSelectedModel]);

  // Load/save pill position
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setPos(JSON.parse(saved));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
    } catch {}
  }, [pos]);

  // Close on outside click
  useEffect(() => {
    const onDocDown = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  const clamp = (nx, ny) => {
    const el = wrapRef.current;
    const w = el?.offsetWidth ?? PILL_W;
    const h = el?.offsetHeight ?? PILL_H;
    const maxX = Math.max(EDGE, (window.innerWidth || 0) - w - EDGE);
    const maxY = Math.max(EDGE, (window.innerHeight || 0) - h - EDGE);
    return { x: Math.min(Math.max(EDGE, nx), maxX), y: Math.min(Math.max(EDGE, ny), maxY) };
  };

  function onPointerDown(e) {
    if (e.button === 2) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    press.current = {
      x: e.clientX,
      y: e.clientY,
      moved: 0,
      offX: e.clientX - (rect?.left ?? 0),
      offY: e.clientY - (rect?.top ?? 0),
    };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - press.current.x;
    const dy = e.clientY - press.current.y;
    press.current.moved = Math.hypot(dx, dy);
    setPos(clamp(e.clientX - press.current.offX, e.clientY - press.current.offY));
  }
  function onPointerUp(e) {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const moved = press.current.moved;
    setDragging(false);
    if (moved < CLICK_DRAG_THRESHOLD) setOpen((v) => !v);
  }

  const selected = MODELS.find((m) => m.label === current) || MODELS[0];

  return (
    <div ref={wrapRef} className="fixed z-[10001] select-none" style={{ left: pos.x, top: pos.y }}>
      {/* Pill */}
      <div
        role="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        tabIndex={0}
        className="h-12 w-auto min-w-[140px] max-w-[90vw] rounded-full !bg-[#176A82] text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] flex items-center justify-between px-3 cursor-grab active:cursor-grabbing outline-none ring-0 border-0"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDragStart={(e) => e.preventDefault()}
        title={`${selected.label} — ${selected.provider}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex items-center justify-center rounded-full bg-white flex-none" style={{ width: 36, height: 36 }}>
            <Image
              src={selected.icon || "/OpenAI-Logo.png"}
              alt={selected.provider}
              width={28}
              height={28}
              className="object-contain"
              priority
            />
          </span>
          <span className="text-base leading-tight font-heading font-semibold tracking-normal truncate">
            {selected.label}
          </span>
        </span>
        <span className={`transition-transform select-none flex-none ${open ? "rotate-90" : ""}`} aria-hidden>
          ▸
        </span>
      </div>

      {/* Dropdown */}
      {open && (
        <div role="listbox" className="mt-2 w-[220px] rounded-2xl overflow-hidden shadow-xl !bg-[#176a82]">
          {MODELS.map((m, i) => {
            const isActive = m.label === selected.label;
            return (
              <button
                role="option"
                aria-selected={isActive}
                key={m.label}
                type="button"
                onClick={() => {
                  setCurrent(m.label);
                  setOpen(false);
                }}
                className="block w-full text-left px-4 py-2 text-white text-base hover:bg-white/10"
                style={{
                  fontWeight: isActive ? 800 : 700,
                  borderBottom: i < MODELS.length - 1 ? "1px dotted rgba(201,238,237,0.85)" : "none",
                }}
              >
                <span className="flex items-center gap-2">
                  <Image src={m.icon || "/OpenAI-Logo.png"} alt={m.provider} width={20} height={20} className="object-contain" />
                  <span>{m.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
