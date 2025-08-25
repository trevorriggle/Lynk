"use client";
import { Brain, ChevronDown } from "lucide-react";

export default function Header({ model, onOpenModelMenu }) {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Brain className="size-5" />
          <span className="font-semibold tracking-tight">Lynk</span>
        </div>
        <button
          onClick={onOpenModelMenu}
          className="inline-flex items-center gap-1 rounded-xl border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-900"
        >
          {model} <ChevronDown className="size-4" />
        </button>
      </div>
    </header>
  );
}
