// components/TopBar.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, ChevronDown, Info, Settings } from "lucide-react";
import { useState } from "react";

export default function TopBar() {
  const [hasUnread, setHasUnread] = useState(true); // stub for now

  return (
    <header className="sticky top-0 z-40 w-full bg-white text-lynk-ink border-b border-black/10">
      <div className="mx-auto flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* Logo + brand */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image
            src="/lynk-logo.svg"
            alt="Lynk"
            width={22}
            height={22}
            priority
          />
          <span className="font-black tracking-tight text-base sm:text-lg">Lynk</span>
        </Link>

        {/* Left spacer */}
        <div className="flex-1" />

        {/* Quick actions (Who are we?, Settings) */}
        <nav className="hidden md:flex items-center gap-2">
          <Link
            href="/who"
            className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm hover:bg-black/5"
          >
            <Info className="size-4" />
            <span>Who are we?</span>
          </Link>

          <Link
            href="/settings"
            className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm hover:bg-black/5"
          >
            <Settings className="size-4" />
            <span>Settings</span>
          </Link>
        </nav>

        {/* Notifications */}
        <button
          type="button"
          aria-label="Notifications"
          className="relative ml-1 inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-black/5"
          onClick={() => setHasUnread(false)}
        >
          <Bell className="size-5" />
          {hasUnread && (
            <span className="absolute right-1 top-1 inline-block h-2 w-2 rounded-full bg-[#176A82]" />
          )}
        </button>

        {/* Account menu (stub) */}
        <div className="relative">
          <button
            type="button"
            className="ml-1 inline-flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-black/5"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#C7EBEA] text-[11px] font-semibold">
              TR
            </span>
            <span className="hidden sm:inline text-sm">Account</span>
            <ChevronDown className="size-4 opacity-70" />
          </button>
          {/* Hook up a dropdown later; routes: /account, /signout */}
        </div>

        {/* Model picker lives to the far right; if you already have it, keep it after this */}
      </div>
    </header>
  );
}
