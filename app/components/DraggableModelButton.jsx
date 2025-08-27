"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

/** Models shown in the dropdown */
const MODELS = [
  "GPT-5 Thinking",
  "GPT-4o",
  "GPT-4",
  "GPT-4o mini",
  "Claude 3.5",
  "Claude Haiku",
  "Claude Sonnet",
  "Gemini 1.5 Pro",
  "Mistral 7b",
  "Llama 3.1",
];

const STORAGE_KEY = "lynk_pill_pos_v6";
const CLICK_DRAG_THRESHOLD = 6;
const PILL_W = 192;  // slightly larger so long names fit
const PILL_H = 48;
const EDGE = 8;

export default function DraggableModelButton({ model, setModel }) {
  const initial = useMemo(() => model || "Gemini 1.5 Pro", [model]);
  const [current, setCurrent] = useState(initial);
  const [open, setOpen] = useState(false);

  const wrapRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState({ x: 24, y: 160 });
  const press = useRef({ x: 0, y: 0, moved: 0, offX: 0, offY: 0 });

  // lift selection up
  useEffect(() => {
    if (setModel) setModel(current);
  }, [current, setModel]);

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

  // close on outside click
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

  return (
    <div
      ref={wrapRef}
      className="fixed z-[10001] select-none"
      style={{ left: pos.x, top: pos.y, width: PILL_W }}
      
    >
      {/* Pill */}
      <div
        role="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        tabIndex={0}
        className={[
          "h-[48px] w-[192px]",
          "rounded-full !bg-[#176A82] text-white",
          "shadow-[0_8px_24px_rgba(0,0,0,0.18)]",
          "flex items-center justify-between px-3",
          "cursor-grab active:cursor-grabbing",
          "outline-none ring-0 border-0",
        ].join(" ")}
        style={{ WebkitTapHighlightColor: "176a82" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="flex items-center justify-center rounded-full bg-white"
            style={{ width: 26, height: 26 }}
          >
            <Image
              src="/OpenAI-Logo.png"
              alt="OpenAI"
              width={18}
              height={18}
              className="object-contain"
              priority
            />
          </span>

        {/* name with ellipsis so it doesn’t break the pill */}
          <span className="text-[13px] font-heading font-semibold tracking-normal truncate">
            {current}
          </span>
        </span>

        {/* chevron (matches LeftStack) */}
        <span
          className={`transition-transform select-none ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          ▸
        </span>
      </div>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          className="mt-2 w-[236px] rounded-2xl overflow-hidden shadow-xl !bg-[#176a82]"
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
              className="block w-full text-left px-4 py-2 text-white text-sm hover:bg-white/10"
              style={{
                fontWeight: m === current ? 800 : 500,
                borderBottom:
                  i < MODELS.length - 1 ? "1px dotted rgba(201,238,237,0.85)" : "none",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
