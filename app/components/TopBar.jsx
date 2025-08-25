"use client";

import Image from "next/image";
import Link from "next/link";

export default function TopBar() {
  return (
    <header className="sticky top-0 z-50 w-full bg-white text-lynk-ink border-b border-black/10">
      {/* Taller bar so the logo is more prominent */}
      <div className="mx-auto flex h-20 items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* Logo only (no text label) */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image src="/lynk-logo.png" alt="Lynk" width={80} height={80} priority />
        </Link>

        <div className="flex-1" />

        {/* Right-side text links (unchanged) */}
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/who" className="rounded-xl px-3 py-1.5 text-sm hover:bg-black/5">
            Who are we?
          </Link>
          <Link href="/settings" className="rounded-xl px-3 py-1.5 text-sm hover:bg-black/5">
            Settings
          </Link>
          <Link href="/account" className="rounded-xl px-3 py-1.5 text-sm hover:bg-black/5">
            Account
          </Link>
        </nav>
      </div>
    </header>
  );
}
