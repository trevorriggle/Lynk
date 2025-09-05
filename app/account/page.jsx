"use client";
import { useState } from "react";

function safeJsonParse(text) {
  if (!text || !text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

export default function AccountPage() {
  const [mode, setMode] = useState("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function hit(path, body) {
    setMsg("");
    setBusy(true);
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const text = await r.text().catch(() => "");
      const data = safeJsonParse(text);

      if (!r.ok) {
        const reason =
          data?.error ||
          data?.message ||
          data?._raw ||
          `HTTP ${r.status}`;
        throw new Error(reason);
      }

      if (mode === "signup") {
        if (data?.needs_confirmation) {
          setMsg("Account created. Please confirm via email to complete sign-up.");
        } else {
          setMsg("Account created and signed in!");
          if (typeof window !== "undefined") {
            try {
              const store = JSON.parse(localStorage.getItem("lynk-sessions-v2") || "{}");
              if (store.state) {
                store.state.guestMessageCount = 0;
                localStorage.setItem("lynk-sessions-v2", JSON.stringify(store));
              }
            } catch {}
          }
          setTimeout(() => (window.location.href = "/"), 1200);
        }
      } else {
        setMsg("Signed in!");
        if (typeof window !== "undefined") {
          try {
            const store = JSON.parse(localStorage.getItem("lynk-sessions-v2") || "{}");
            if (store.state) {
              store.state.guestMessageCount = 0;
              localStorage.setItem("lynk-sessions-v2", JSON.stringify(store));
            }
          } catch {}
        }
        setTimeout(() => (window.location.href = "/"), 1200);
      }
    } catch (e) {
      setMsg(`Error: ${e.message || "Unexpected error"}`);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit() {
    if (!email || !password) {
      setMsg("Please enter email and password.");
      return;
    }
    if (mode === "signup") {
      if (password.length < 8) {
        setMsg("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setMsg("Passwords do not match.");
        return;
      }
      return hit("/api/auth/signup", { email, password });
    }
    return hit("/api/auth/login", { email, password });
  }

  async function onLogout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Account</h1>
        </div>

        <div className="flex rounded-lg overflow-hidden border border-gray-300 mb-6">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 px-4 py-2 text-sm font-medium ${
              mode === "login" 
                ? "bg-gray-900 text-white" 
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Log in
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 px-4 py-2 text-sm font-medium ${
              mode === "signup" 
                ? "bg-gray-900 text-white" 
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Create account
          </button>
        </div>

        <div className="h-80">
          <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={busy}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#176A82] focus:border-[#176A82] disabled:opacity-50"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                disabled={busy}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#176A82] focus:border-[#176A82] disabled:opacity-50"
                placeholder="Enter your password"
              />
            </div>

            <div className={mode === "login" ? "opacity-0 pointer-events-none" : ""}>
              <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                disabled={busy || mode === "login"}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#176A82] focus:border-[#176A82] disabled:opacity-50"
                placeholder="Confirm your password"
                tabIndex={mode === "login" ? -1 : undefined}
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#176A82] hover:bg-[#176A82]/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#176A82] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? "..." : mode === "signup" ? "Create account" : "Log in"}
            </button>
          </form>
        </div>

        {msg && (
          <div className={`text-sm text-center p-3 rounded-md ${
            msg.includes("Error") || msg.includes("do not match") || msg.includes("at least") 
              ? "text-red-600 bg-red-50" 
              : "text-green-600 bg-green-50"
          }`}>
            {msg}
          </div>
        )}

        <hr className="my-6 border-gray-300" />

        <button
          onClick={onLogout}
          disabled={busy}
          className="w-full py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#176A82] disabled:opacity-50"
        >
          Log out
        </button>

        <div className="text-xs text-gray-500 text-center">
          Forgot your password? You can send a reset email from Supabase.
        </div>
      </div>
    </div>
  );
}