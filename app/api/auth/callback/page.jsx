"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Callback() {
  const router = useRouter();
  const [status, setStatus] = useState("Validating link…");

  useEffect(() => {
    async function run() {
      try {
        const hash = new URLSearchParams(window.location.hash.slice(1));
        const access_token = hash.get("access_token");
        if (!access_token) {
          setStatus("Invalid link. Please request a new one.");
          return;
        }
        const r = await fetch("/api/auth/finish", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ access_token }),
        });
        if (!r.ok) {
          setStatus("Sign-in failed. Try again.");
          return;
        }
        setStatus("Signed in. Redirecting…");
        setTimeout(() => router.replace("/chat"), 600);
      } catch {
        setStatus("Unexpected error.");
      }
    }
    run();
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-slate-700">{status}</p>
    </main>
  );
}
