"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Callback() {
  const router = useRouter();
  const [status, setStatus] = useState("Validating link…");

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    (async () => {
      try {
        if (!access_token) throw new Error("Missing token");
        const r = await fetch("/api/auth/finish", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ access_token, refresh_token }),
        });
        if (!r.ok) throw new Error("Sign-in failed");
        setStatus("Signed in. Redirecting…");
        setTimeout(() => router.replace("/chat"), 600);
      } catch (e) {
        setStatus("Invalid or expired link. Please request a new one.");
      }
    })();
  }, [router]);

  return <main className="min-h-screen grid place-items-center"><p>{status}</p></main>;
}
