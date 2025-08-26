"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/** Model list from the Lynk UI doc */
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

export default function DraggableModelButton({ model, setModel }) {
  const [current, setCurrent] = useState(model || "GPT-4o");
  const [open, setOpen] = useState(false);

  // Drag state
  const wrapperRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState({ x: 24, y: 24 });
  const pressOffset = useRef({ x: 0, y: 0 });

  // Persist position
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lynk_pill_pos");
      if (saved) setPos(JSON.parse(saved));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("lynk_pill_pos", JSON.stringify(pos));
    } catch {}
  }, [pos]);

  // Propagate selection to parent if provided
  useEffect(() => {
    if (setModel) setModel(current);
  }, [current, setModel]);

  // Close on outside click
  useEffect(() => {
    function onDocClick(e) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Pointer (mouse/touch) drag handlers
  function onPointerDown(e) {
    if (e.button === 2) return;
    setDragging(true);
    const rect = wrapperRef.current?.getBoundingClientRect();
    pressOffset.current = {
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const w = wrapperRef.current?.offsetWidth ?? 0;
    const h = wrapperRef.current?.offsetHeight ?? 0;
    const nx = Math.min(Math.max(8, e.clientX - pressOffset.current.x), window.innerWidth - w - 8);
    const ny = Math.min(Math.max(8, e.clientY - pressOffset.current.y), window.innerHeight - h - 8);
    setPos({ x: nx, y: ny });
  }
  function onPointerUp(e) {
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }

  return (
    <div
      ref={wrapperRef}
      className="fixed z-50 select-none"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Pill */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => !dragging && setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full px-3 py-1.5 shadow-md"
        style={{
          backgroundColor: "#176A82",      // teal (spec)
          color: "white",
          border: "2px solid #094858",     // darker teal stroke
        }}
      >
        {/* Left circular logo slot */}
        <span
          className="flex items-center justify-center rounded-full bg-white"
          style={{ border: "2px solid #094858", width: 28, height: 28 }}
        >
          <Image src="/OpenAI-Logo.png" alt="" width={24} height={24} />
        </span>

        {/* Text */}
        <span className="font-medium tracking-wide text-sm">{current}</span>

        {/* Right hamburger */}
        <span className="ml-1">
          <Image
            src={open ? "/hamburger_expanded.png" : "/hamburger.png"}
            alt="menu"
            width={18}
            height={18}
          />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="mt-2 w-56 rounded-2xl overflow-hidden shadow-xl"
          style={{
            backgroundColor: "#176A82",
            border: "2px solid #094858",
          }}
        >
          {MODELS.map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setCurrent(m);
                setOpen(false);
              }}
              className="block w-full text-left px-4 py-2 text-white"
              style={{
                fontWeight: m === current ? 700 : 500,
                borderBottom:
                  i < MODELS.length - 1 ? "1px dotted rgba(199,235,234,0.75)" : "none", // dotted sep
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
