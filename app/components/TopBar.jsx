// components/TopBar.jsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

// Tiny inline icons (no extra packages)
const IconBell = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
    <path d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z" fill="currentColor"/>
  </svg>
);
const IconInfo = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
    <path d="M11 17h2v-6h-2v6Zm0-8h2V7h-2v2Zm1-7a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z" fill="currentColor"/>
  </svg>
);
const IconGear = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
    <path d="M19.14 12.94a7.5 7.5 0 0 0 .05-.94 7.5 7.5 0 0 0-.05-.94l2.03-1.58-1.92-3.32-2.39.97a7.58 7.58 0 0 0-1.63-.94l-.36-2.55h-3.84l-.36 2.55c-.57.22-1.11.52-1.63.94l-2.39-.97-1.92 3.32L4.86 11.06c-.03.31-.05.63-.05.94s.02.63.05.94l-2.03 1.58 1.92 3.32 2.39-.97c.52.42 1.06.72 1.63.94l.36 2.55h3.84l.36-2.55c.57-.22 1.11-.52 1.63-.94l2.39.97 1.92-3.32-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" fill="currentColor"/>
  </svg>
);
const IconChevron = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}>
    <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function TopBar() {
  const [hasUnread, setHasUnread] = useState(true);

  return (
    <header className="sticky top-0 z-40 w-full bg-white text-lynk-ink border-b border-black/10">
      <div className="mx-auto flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image src="/lynk-logo.svg" alt="Lynk" width={22} height={22} priority />
          <span className="font-black tracking-tight text-base sm:text-lg">Lynk</span>
        </Link>

        <div className="flex-1" />

        {/* Who are we? */}
        <Link
          href="/who"
          className="hidden md:inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm hover:bg-black/5"
        >
          <IconInfo />
          <span>Who are we?</span>
        </Link>

        {/* Settings */}
        <Link
          href="/settings"
          className="hidden md:inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm hover:bg-black/5"
        >
          <IconGear />
          <span>Settings</span>
        </Link>

        {/* Notifications */}
        <button
          type="button"
          aria-label="Notifications"
          className="relative ml-1 inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-black/5"
          onClick={() => setHasUnread(false)}
        >
          <IconBell />
          {hasUnread && (
            <span className="absolute right-1 top-1 inline-block h-2 w-2 rounded-full bg-[#176A82]" />
          )}
        </button>

        {/* Account */}
        <button
          type="button"
          className="ml-1 inline-flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-black/5"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#C7EBEA] text-[11px] font-semibold">
            TR
          </span>
          <span className="hidden sm:inline text-sm">Account</span>
          <IconChevron className="opacity-70" />
        </button>
      </div>
    </header>
  );
}
