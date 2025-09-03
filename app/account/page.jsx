"use client";

import { useState } from "react";

export default function AccountPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  async function sendMagic() {
    setSending(true);
    setMsg("");
    try {
      const r = await fetch("/api/auth/send-magic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) throw new Error(await r.text());
      setMsg("Check your email for the sign-in link.");
    } catch (e) {
      setMsg("Could not send link. Double-check the email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm text-center">
        <img
          src="/lynk-logo.png"
          alt="Lynk"
          className="mx-auto mb-8 h-12 opacity-90"
        />
        <input
          type="email"
          placeholder="you@example.com"
          className="w-full border-b border-slate-300 py-3 text-center outline-none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          onClick={sendMagic}
          disabled={sending || !email}
          className="mt-6 w-full rounded-full border border-sky-900 px-4 py-3 font-medium text-sky-900 hover:bg-sky-50 disabled:opacity-50"
        >
          {sending ? "Sending…" : "Email me a login link"}
        </button>
        {msg ? <p className="mt-4 text-sm text-slate-600">{msg}</p> : null}
        <p className="mt-8 text-xs text-slate-500">
          No password. We use a magic link.
        </p>
      </div>
    </main>
  );
}
