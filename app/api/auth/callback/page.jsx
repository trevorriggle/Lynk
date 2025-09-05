"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Callback() {
  const router = useRouter();
  const [status, setStatus] = useState("Validating link…");

  useEffect(() => {
    (async () => {
      try {
        // Extract tokens from URL hash (fragment)
        const hash = window.location.hash.slice(1); // Remove the #
        const params = new URLSearchParams(hash);
        
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        const error = params.get("error");
        
        if (error) {
          throw new Error(`Auth error: ${error}`);
        }
        
        if (!access_token) {
          throw new Error("Missing access token in callback URL");
        }
        
        setStatus("Processing authentication…");
        
        // Call our finish endpoint to set cookies and create user profile
        const r = await fetch("/api/auth/finish", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ access_token, refresh_token }),
        });
        
        if (!r.ok) {
          const errorText = await r.text();
          throw new Error(`Authentication failed: ${errorText}`);
        }
        
        const data = await r.json();
        console.log("Auth success:", data);
        
        setStatus("Signed in successfully! Redirecting…");
        
        // Clear the URL hash and redirect to home
        window.history.replaceState({}, document.title, "/");
        setTimeout(() => router.replace("/"), 1000);
        
      } catch (e) {
        console.error("Callback error:", e);
        setStatus(`Authentication failed: ${e.message}. Please try signing in again.`);
        setTimeout(() => router.replace("/account"), 3000);
      }
    })();
  }, [router]);

  return (
    <main className="min-h-screen grid place-items-center bg-gray-50">
      <div className="text-center p-8">
        <div className="mb-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#176A82] mx-auto"></div>
        </div>
        <p className="text-gray-600">{status}</p>
      </div>
    </main>
  );
}