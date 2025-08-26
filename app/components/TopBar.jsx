"use client";

export default function TopBar() {
  return (
    <header className="fixed inset-x-0 top-0 z-[10000] h-12 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="mx-auto max-w-screen-2xl h-full px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-block h-6 w-6 rounded-full bg-brand-teal/10 border border-brand-teal/30" />
          <span className="text-sm font-heading font-black text-brand-teal tracking-tight">
            Lynk
          </span>
        </div>
        <div className="text-xs text-slate-500">
          Welcome to Lynk.
        </div>
      </div>
    </header>
  );
}
