"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

// Model list (edit if you like)
const MODELS = [
  "GPT-4o",
  "GPT-4",
  "GPT-4o mini",
  "Claude 3.5",
  "Claude Haiku",
  "Claude Sonnet",
  "Gemini 1.5",
  "Mistral 7b",
  "Llama 3.1",
];

const STORAGE_KEY = "lynk_pill_pos";
const CLICK_DRAG_THRESHOLD = 6; // px before we treat it as a drag

export default function DraggableModelButton({ model, setModel }) {
  const defaultModel = useMemo(() => model || "GPT-4o", [model]);
  const [current, setCurrent] = useState(defaultModel);
  const [open, setOpen] = useState(false);

  // ---- drag state
  const wrapperRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState({ x: 24, y: 100 }); // visible by default
  const press = useRef({ x: 0, y: 0, moved: 0, offX: 0, offY: 0 });

  // load/save position
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

  // bubble selection up
  useEffect(() => {
    if (setModel) setModel(current);
  }, [current, setModel]);

  // click-outside to close
  useEffect(() => {
    const onDocDown = (e) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  function clampToViewport(nx, ny) {
    const el = wrapperRef.current;
    const w = el?.offsetWidth ?? 0;
    const h = el?.offsetHeight ?? 0;
    const margin = 8;
    const maxX = Math.max(margin, (window.innerWidth || 0) - w - margin);
    const maxY = Math.max(margin, (window.innerHeight || 0) - h - margin);
    return {
      x: Math.min(Math.max(margin, nx), maxX),
      y: Math.min(Math.max(margin, ny), maxY),
    };
  }

  function onPointerDown(e) {
    if (e.button === 2) return; // ignore right-click
    const rect = wrapperRef.current?.getBoundingClientRect();
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

    const nx = e.clientX - press.current.offX;
    const ny = e.clientY - press.current.offY;
    setPos(clampToViewport(nx, ny));
  }

  function onPointerUp(e) {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const moved = press.current.moved;
    setDragging(false);

    // if it wasn't really a drag, treat as a click on the pill
    if (moved < CLICK_DRAG_THRESHOLD) setOpen((v) => !v);
  }

  return (
    <div
      ref={wrapperRef}
      className="fixed z-[9999] select-none"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* --- Pill button (no strokes/rings) --- */}
      <div className="pointer-events-auto">
        <div
          role="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          tabIndex={0}
          // No onClick: we toggle in onPointerUp when not dragged
          className={[
            "flex items-center gap-2",
            "rounded-full px-3 py-1.5",
            "shadow-md",
            "bg-[#176A82] text-white",
            "cursor-grab active:cursor-grabbing",
            "outline-none focus:outline-none ring-0 border-0",
          ].join(" ")}
          style={{
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {/* left logo circle — no border, fixed size, no stretch */}
          <span
            className="flex items-center justify-center rounded-full bg-white"
            style={{ width: 28, height: 28 }}
          >
            <Image
              src="/OpenAI-Logo.png"
              alt="OpenAI"
              width={22}
              height={22}
              className="object-contain"
              priority
            />
          </span>

          {/* model text */}
          <span className="font-medium tracking-wide text-sm">{current}</span>

          {/* right hamburger */}
          <span className="ml-1">
            <Image
              src={open ? "/hamburger_expanded.png" : "/hamburger_collapsed.png"}
              alt="menu"
              width={18}
              height={18}
              className="object-contain"
              priority
            />
          </span>
        </div>

        {/* --- Dropdown --- */}
        {open && (
          <div
            role="listbox"
            className="mt-2 w-56 rounded-2xl overflow-hidden shadow-xl"
            style={{
              backgroundColor: "#176A82", // teal menu per spec
            }}
          >
            {MODELS.map((m, i) => (
              <button
                role="option"
                aria-selected={m === current}
                key={m}
                type="button"
                onClick={() => {
                  setCurrent(m);
                  setOpen(false);
                }}
                className={[
                  "block w-full text-left px-4 py-2 text-white text-sm",
                  "hover:bg-white/10",
                ].join(" ")}
                style={{
                  fontWeight: m === current ? 700 : 500,
                  // dotted separators in aqua
                  borderBottom:
                    i < MODELS.length - 1
                      ? "1px dotted rgba(199,235,234,0.85)"
                      : "none",
                }}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
