"use client";

import Image from "next/image";
import Link from "next/link";

export default function TopBar() {
  return (
    <header className="sticky top-0 z-40 w-full bg-white text-lynk-ink border-b border-black/10">
      <div className="mx-auto flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* Lynk logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image src="/lynk-logo.png" alt="Lynk" width={22} height={22} priority />
          <span className="font-black tracking-tight text-base sm:text-lg">Lynk</span>
        </Link>

        <div className="flex-1" />

        {/* Text links */}
        <Link
          href="/who"
          className="hidden md:inline-flex items-center rounded-xl px-3 py-1.5 text-sm hover:bg-black/5"
        >
          Who are we?
        </Link>

        <Link
          href="/settings"
          className="hidden md:inline-flex items-center rounded-xl px-3 py-1.5 text-sm hover:bg-black/5"
        >
          Settings
        </Link>

        <Link
          href="/account"
          className="ml-1 inline-flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-black/5 text-sm"
        >
          Account
        </Link>
      </div>
    </header>
  );
}
