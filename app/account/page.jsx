"use client";
import { useState, useEffect } from "react";

function safeJsonParse(text) {
  if (!text || !text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

// Helper function to completely clear guest session data
function clearGuestSessionData() {
  if (typeof window === "undefined") return;
  
  try {
    // Get the current store
    const store = JSON.parse(localStorage.getItem("lynk-sessions-v2") || "{}");
    
    if (store.state) {
      // Clear all guest-related data
      store.state.guestMessageCount = 0;
      store.state.sessions = {}; // Clear all sessions - guest sessions should not persist into authenticated accounts
      store.state.currentSessionId = null;
      
      // Save the cleaned store back
      localStorage.setItem("lynk-sessions-v2", JSON.stringify(store));
    }
  } catch (e) {
    console.warn("Failed to clear guest session data:", e);
    // If parsing fails, just clear the entire store
    localStorage.removeItem("lynk-sessions-v2");
  }
}

// Dashboard component for authenticated users
function AccountDashboard({ userEmail, userId, onLogout }) {
  const [stats, setStats] = useState({
    messagesUsed: 0,
    messagesLimit: 20,
    accountCreated: null,
    totalSessions: 0
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Get usage stats from localStorage (your Zustand store)
    try {
      const store = JSON.parse(localStorage.getItem("lynk-sessions-v2") || "{}");
      const state = store.state;
      
      if (state) {
        const sessions = state.sessions || {};
        const sessionCount = Object.keys(sessions).length;
        
        // Count total user messages across all sessions
        let totalMessages = 0;
        Object.values(sessions).forEach(session => {
          if (session.messages) {
            totalMessages += session.messages.filter(m => m.role === "user").length;
          }
        });

        setStats({
          messagesUsed: totalMessages,
          messagesLimit: 20, // authenticated users get 20
          accountCreated: new Date().toLocaleDateString(), // placeholder
          totalSessions: sessionCount
        });
      }
    } catch (e) {
      console.warn("Failed to load usage stats:", e);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8" style={{height: '100vh', overflowY: 'auto'}}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Account Dashboard</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage your Lynk account and view usage statistics
          </p>
        </div>

        {/* Account Info Card */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h2>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700">Email</span>
              <span className="text-sm text-gray-900">{userEmail}</span>
            </div>
            
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700">Account Type</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Free Account
              </span>
            </div>
            
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700">User ID</span>
              <span className="text-sm text-gray-500 font-mono">{userId?.slice(0, 8)}...</span>
            </div>
            
            <div className="flex justify-between items-center py-2">
              <span className="text-sm font-medium text-gray-700">Member Since</span>
              <span className="text-sm text-gray-900">{stats.accountCreated}</span>
            </div>
          </div>
        </div>

        {/* Usage Stats Card */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Usage Statistics</h2>
          
          <div className="space-y-4">
            {/* Message Usage */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Messages This Month</span>
                <span className="text-sm text-gray-900">
                  {stats.messagesUsed} / {stats.messagesLimit}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-[#176A82] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min((stats.messagesUsed / stats.messagesLimit) * 100, 100)}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {stats.messagesLimit - stats.messagesUsed} messages remaining
              </p>
            </div>

            {/* Session Count */}
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700">Total Conversations</span>
              <span className="text-sm text-gray-900">{stats.totalSessions}</span>
            </div>

            {/* AI Models Available */}
            <div>
              <span className="text-sm font-medium text-gray-700 block mb-2">Available AI Models</span>
              <div className="flex flex-wrap gap-2">
                {["Claude", "OpenAI", "Gemini", "Grok"].map((model) => (
                  <span 
                    key={model}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#176A82] text-white"
                  >
                    {model}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Account Actions Card */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Actions</h2>
          
          <div className="space-y-3">
            <button className="w-full text-left px-4 py-3 rounded-md border border-gray-300 hover:bg-gray-50 transition-colors">
              <div className="font-medium text-gray-900">Change Password</div>
              <div className="text-sm text-gray-500">Update your account password</div>
            </button>
            
            <button className="w-full text-left px-4 py-3 rounded-md border border-gray-300 hover:bg-gray-50 transition-colors">
              <div className="font-medium text-gray-900">Export Data</div>
              <div className="text-sm text-gray-500">Download your conversation history</div>
            </button>
            
            <button className="w-full text-left px-4 py-3 rounded-md border border-red-300 text-red-700 hover:bg-red-50 transition-colors">
              <div className="font-medium">Delete Account</div>
              <div className="text-sm text-red-600">Permanently delete your account and data</div>
            </button>
          </div>
        </div>

        {/* Logout Button */}
        <div className="text-center">
          <button
            onClick={onLogout}
            disabled={busy}
            className="w-full sm:w-auto px-6 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#176A82] disabled:opacity-50"
          >
            {busy ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Login/Signup component for unauthenticated users
function AuthForms() {
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
        const reason = data?.error || data?.message || data?._raw || `HTTP ${r.status}`;
        throw new Error(reason);
      }

      if (mode === "signup") {
        if (data?.needs_confirmation) {
          setMsg("Account created. Please confirm via email to complete sign-up.");
        } else {
          setMsg("Account created and signed in!");
          // Clear guest session data completely when signing up
          clearGuestSessionData();
          setTimeout(() => (window.location.href = "/"), 1200);
        }
      } else {
        setMsg("Signed in!");
        // Clear guest session data completely when logging in
        clearGuestSessionData();
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

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" style={{height: '100vh', overflowY: 'auto'}}>
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

        <div className="text-xs text-gray-500 text-center">
          Forgot your password? You can send a reset email from Supabase.
        </div>
      </div>
    </div>
  );
}

// Main component that handles auth state
export default function AccountPage() {
  const [authState, setAuthState] = useState({
    loading: true,
    authenticated: false,
    userId: null,
    userEmail: null,
  });

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const r = await fetch("/api/me", { 
          cache: "no-store",
          credentials: "include",
        });
        
        if (r.ok) {
          const data = await r.json();
          const isAuthenticated = !!data.userId;
          
          setAuthState({
            loading: false,
            authenticated: isAuthenticated,
            userId: data.userId,
            userEmail: data.project?.email || null,
          });
          
          // If user is authenticated, clear any guest session data that might exist
          if (isAuthenticated) {
            clearGuestSessionData();
          }
        } else {
          setAuthState({
            loading: false,
            authenticated: false,
            userId: null,
            userEmail: null,
          });
        }
      } catch (e) {
        console.warn("Auth check error:", e);
        setAuthState({
          loading: false,
          authenticated: false,
          userId: null,
          userEmail: null,
        });
      }
    };
    
    checkAuth();
  }, []);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      // Clear all session data on logout
      if (typeof window !== "undefined") {
        localStorage.removeItem("lynk-sessions-v2");
      }
      window.location.reload();
    } catch (e) {
      console.warn("Logout error:", e);
      // Still clear localStorage even if logout API fails
      if (typeof window !== "undefined") {
        localStorage.removeItem("lynk-sessions-v2");
      }
      window.location.reload();
    }
  }

  if (authState.loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" style={{height: '100vh', overflowY: 'auto'}}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#176A82] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading account information...</p>
        </div>
      </div>
    );
  }

  if (authState.authenticated) {
    return (
      <AccountDashboard 
        userEmail={authState.userEmail}
        userId={authState.userId}
        onLogout={handleLogout}
      />
    );
  }

  return <AuthForms />;
}