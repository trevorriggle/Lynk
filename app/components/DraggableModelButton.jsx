"use client";
import { useEffect, useRef, useState } from "react";
import { Bot } from "lucide-react";

const MODELS = ["GPT-4o", "GPT-4o mini", "Claude 3.5 Sonnet", "Claude 3.5 Haiku", "Gemini 1.5 Pro", "Llama 3.1 70B"];

export default function DraggableModelButton({ model, setModel, openFromHeader }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const pos = useRef({ x: 16, y: 16 });
  const drag = useRef({ active: false, dx: 0, dy: 0 });

  useEffect(() => { if (openFromHeader) setOpen(true); }, [openFromHeader]);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const down = (e) => { if (e.target.closest("[data-menu]")) return; drag.current.active = true; drag.current.dx = e.clientX - pos.current.x; drag.current.dy = e.clientY - pos.current.y; };
    const move = (e) => { if (!drag.current.active) return; pos.current.x = e.clientX - drag.current.dx; pos.current.y = e.clientY - drag.current.dy; el.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`; };
    const up = () => (drag.current.active = false);
    el.addEventListener("pointerdown", down); window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { el.removeEventListener("pointerdown", down); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  return (
    <div ref={ref} className="fixed bottom-6 right-6 z-50" style={{ transform: `translate(${pos.current.x}px, ${pos.current.y}px)` }}>
      <button onClick={() => setOpen((s) => !s)} className="flex items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-900/90 px-4 py-2 shadow-lg" aria-expanded={open}>
        <Bot className="size-4" /><span className="text-sm">Model: {model}</span>
      </button>

      {open && (
        <div data-menu className="mt-2 w-56 rounded-2xl border border-zinc-700 bg-zinc-900/95 p-2 shadow-xl">
          {MODELS.map((m) => (
            <button key={m} onClick={() => { setModel(m); setOpen(false); }}
              className={"w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-zinc-800 " + (m === model ? "bg-zinc-800 ring-1 ring-zinc-600" : "")}>
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
