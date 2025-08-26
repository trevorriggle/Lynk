"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "lynk_pill_pos";
const CLICK_DRAG_THRESHOLD = 6; // px before we call it a drag

export default function DraggableModelButton() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 24, y: 100 });
  const [dragging, setDragging] = useState(false);
  const press = useRef({ x: 0, y: 0, offX: 0, offY: 0, moved: 0 });
  const wrapperRef = useRef(null);

  // load/save pos
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

  function clamp(nx, ny) {
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
    if (e.button === 2) return;
    const rect = wrapperRef.current?.getBoundingClientRect();
    press.current = {
      x: e.clientX,
      y: e.clientY,
      offX: e.clientX - (rect?.left ?? 0),
      offY: e.clientY - (rect?.top ?? 0),
      moved: 0,
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
    setPos(clamp(nx, ny));
  }
  function onPointerUp(e) {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const moved = press.current.moved;
    setDragging(false);
    if (moved < CLICK_DRAG_THRESHOLD) {
      setOpen((v) => !v);
    }
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
      {/* --- pill artwork --- */}
      <Image
        src={open ? "/model_picker_expanded.png" : "/model_picker.png"}
        alt="Model Picker"
        width={176}
        height={44}
        priority
      />

      {/* --- dropdown artwork (optional) --- */}
      {open && (
        <div className="mt-2">
          <Image
            src="/model_picker_expanded.png"
            alt="Expanded picker"
            width={220}
            height={260}
            priority
          />
        </div>
      )}
    </div>
  );
}
