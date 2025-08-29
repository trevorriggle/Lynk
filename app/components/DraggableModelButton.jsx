// app/components/DraggableModelButton.jsx
"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

/** Two options with explicit endpoints */
const MODELS = [
  { label: "Claude", provider: "anthropic", model: "claude-3-haiku-20240307", endpoint: "/api/claude" },
  { label: "OpenAI", provider: "openai",    model: "gpt-4o-mini",           endpoint: "/api/openai" },
];

const STORAGE_KEY = "lynk_pill_pos_v8";
const CLICK_DRAG_THRESHOLD = 6;
const PILL_W = 192;
const PILL_H = 48;
const EDGE = 8;

export default function DraggableModelButton({ model, setModel }) {
  // accept either string or object; default to Claude
  const initial = useMemo(
    () => (typeof model === "string" ? model : model?.label) || "Claude",
    [model]
  );
  const [current, setCurrent] = useState(initial);
  const [open, setOpen] = useState(false);

  const wrapRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState({ x: 24, y: 160 });
  const press = useRef({ x: 0, y: 0, moved: 0, offX: 0, offY: 0 });

  // Lift full selection → parent gets { label, provider, model, endpoint }
  useEffect(() => {
    const selected = MODELS.find((m) => m.label === current) || MODELS[0];
    setModel?.(selected);
  }, [current, setModel]);

  // Load/save pos
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
    return {
      x: Math.min(Math.max(EDGE, nx), maxX),
      y: Math.min(Math.max(EDGE, ny), maxY),
    };
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

  const currentProvider =
    MODELS.find((m) => m.label === current)?.provider || "anthropic";

  const logoSrc =
    currentProvider === "anthropic"
      ? "/anthropic-logo.png"
      : "/OpenAI-Logo.png";

  return (
    <div
      ref={wrapRef}
      className="fixed z-[10001] select-none"
      style={{ left: pos.x, top: pos.y }}
    >
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
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="flex items-center justify-center rounded-full bg-white flex-none"
            style={{ width: 36, height: 36 }}
          >
            <Image
              src={logoSrc}
              alt={currentProvider}
              width={28}
              height={28}
              className="object-contain"
              priority
            />
          </span>
          <span className="text-base leading-tight font-heading font-semibold tracking-normal truncate">
            {current}
          </span>
        </span>
        <span
          className={`transition-transform select-none flex-none ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          ▸
        </span>
      </div>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          className="mt-2 w-[200px] rounded-2xl overflow-hidden shadow-xl !bg-[#176a82]"
        >
          {MODELS.map((m, i) => (
            <button
              role="option"
              aria-selected={m.label === current}
              key={m.label}
              type="button"
              onClick={() => {
                setCurrent(m.label);
                setOpen(false);
              }}
              className="block w-full text-left px-4 py-2 text-white text-sm hover:bg-white/10"
              style={{
                fontWeight: m.label === current ? 800 : 500,
                borderBottom:
                  i < MODELS.length - 1
                    ? "1px dotted rgba(201,238,237,0.85)"
                    : "none",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
