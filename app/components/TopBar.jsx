"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

function ChevronDown({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.28l3.71-3.05a.75.75 0 111.04 1.08l-4.23 3.48a.75.75 0 01-.96 0L5.21 8.31a.75.75 0 01.02-1.1z" />
    </svg>
  );
}

function Magnifier({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
      <circle cx="11" cy="11" r="7" strokeWidth="2"></circle>
      <path d="M20 20l-3.5-3.5" strokeWidth="2"></path>
    </svg>
  );
}

function PencilIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" strokeWidth="2"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" strokeWidth="2"/>
    </svg>
  );
}

function ShareIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" strokeWidth="2"/>
      <polyline points="16,6 12,2 8,6" strokeWidth="2"/>
      <line x1="12" y1="2" x2="12" y2="15" strokeWidth="2"/>
    </svg>
  );
}

function DownloadIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeWidth="2"/>
      <polyline points="7,10 12,15 17,10" strokeWidth="2"/>
      <line x1="12" y1="15" x2="12" y2="3" strokeWidth="2"/>
    </svg>
  );
}

export default function EnhancedTopBar() {
  const logoSizeClass = "h-12";
  
  // Get the store functions we need
  const createSession = useSessionStore((s) => s.createSession);
  const selectedModel = useSessionStore((s) => s.selectedModel);

  // Check authentication status
  const [authState, setAuthState] = useState({
    loading: true,
    authenticated: false,
    userEmail: null,
  });

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        if (r.ok) {
          const data = await r.json();
          setAuthState({
            loading: false,
            authenticated: !!data.userId,
            userEmail: data.project?.email || null,
          });
        } else {
          setAuthState({
            loading: false,
            authenticated: false,
            userEmail: null,
          });
        }
      } catch {
        setAuthState({
          loading: false,
          authenticated: false,
          userEmail: null,
        });
      }
    };
    checkAuth();
  }, []);

  // Interact dropdown state
  const [interactOpen, setInteractOpen] = useState(false);
  const interactWrapRef = useRef(null);

  // Close interact menu on outside click
  useEffect(() => {
    const onDocDown = (e) => {
      if (!interactWrapRef.current) return;
      if (!interactWrapRef.current.contains(e.target)) setInteractOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  // Fire window events for different interaction types
  function openInteraction(type) {
    try {
      window.dispatchEvent(new CustomEvent("interact:open", { detail: { type } }));
    } catch (error) {
      console.warn("Failed to dispatch interact event:", error);
    }
    setInteractOpen(false);
  }

  // Handle new chat creation - simplified and direct
  const handleNewChat = () => {
    try {
      // Create the new session - this automatically sets it as active
      const sessionId = createSession(selectedModel);
      
      // Dispatch custom event to notify other components
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("session:created", { 
          detail: { sessionId, model: selectedModel }
        }));
      }
      
      console.log("New chat created:", sessionId);
    } catch (error) {
      console.error("Failed to create new chat:", error);
    }
  };

  return (
    <header className="sticky top-0 z-[100] w-full bg-[#E6E8EA]">
      <div className="mx-auto max-w-[1400px] px-4">
        <div className="flex h-14 items-center gap-3">
          {/* LEFT: logo + workspace */}
          <div className="flex items-center gap-4 shrink-0">
            <Link href="/" className="flex items-center">
              <img
                src="/lynk-logo.png"
                alt="Lynk"
                className={`${logoSizeClass} w-auto select-none`}
                draggable="false"
              />
            </Link>

            <div className="hidden items-center gap-2 sm:flex text-gray-600">
              <span className="text-sm">Project</span>
              <button
                type="button"
                aria-label="Select workspace"
                className="inline-flex items-center gap-1 rounded-md bg-white/70 px-3 py-1 text-sm font-medium text-gray-700 ring-1 ring-black/10 hover:bg-white"
              >
                Workspace
                <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
              </button>
            </div>
          </div>

          {/* CENTER: search */}
          <div className="flex flex-1 min-w-0">
            <label
              htmlFor="lynk-search"
              role="search"
              aria-label="Search"
              className="flex w-full max-w-[720px] items-center gap-3 rounded-full bg-white px-4 py-2 ring-1 ring-black/10"
            >
              <Magnifier className="h-4 w-4 text-gray-500" />
              <input
                id="lynk-search"
                type="text"
                placeholder="Search files, chats, and commands..."
                className="w-full bg-transparent text-[15px] leading-6 text-gray-800 placeholder:font-medium focus:outline-none"
              />
            </label>
          </div>

          {/* RIGHT: actions */}
          <div className="relative flex items-center gap-3 shrink-0">
            <button
              onClick={handleNewChat}
              className="rounded-full bg-[#176A82] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 active:opacity-90 transition-opacity"
              type="button"
              title="Create new chat session"
            >
              New Chat
            </button>

            {/* Interact/Collaborate dropdown */}
            <div ref={interactWrapRef} className="relative">
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={interactOpen}
                onClick={() => setInteractOpen((v) => !v)}
                className="rounded-full bg-[#176A82] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 inline-flex items-center gap-1"
                title="Interact & Collaborate"
              >
                Interact
                <span className={`transition-transform duration-200 ${interactOpen ? "rotate-90" : ""}`} aria-hidden>
                  ▸
                </span>
              </button>

              {interactOpen && (
                <div
                  role="listbox"
                  className="absolute right-0 mt-2 w-52 rounded-2xl overflow-hidden shadow-xl !bg-[#176A82] z-[101]"
                >
                  <button
                    role="option"
                    type="button"
                    onClick={() => openInteraction("draw")}
                    className="flex items-center gap-3 w-full text-left px-4 py-3 text-white text-base hover:bg-white/10 font-semibold transition-colors"
                    style={{ borderBottom: "1px dotted rgba(201,238,237,0.85)" }}
                  >
                    <PencilIcon className="h-4 w-4" />
                    Draw & Sketch
                  </button>
                  
                  <button
                    role="option"
                    type="button"
                    onClick={() => openInteraction("share")}
                    className="flex items-center gap-3 w-full text-left px-4 py-3 text-white text-base hover:bg-white/10 font-semibold transition-colors"
                    style={{ borderBottom: "1px dotted rgba(201,238,237,0.85)" }}
                  >
                    <ShareIcon className="h-4 w-4" />
                    Share Chat
                  </button>
                  
                  <button
                    role="option"
                    type="button"
                    onClick={() => openInteraction("invite")}
                    className="flex items-center gap-3 w-full text-left px-4 py-3 text-white text-base hover:bg-white/10 font-semibold transition-colors"
                    style={{ borderBottom: "1px dotted rgba(201,238,237,0.85)" }}
                  >
                    <ShareIcon className="h-4 w-4" />
                    Invite to Chat
                  </button>
                  
                  <button
                    role="option"
                    type="button"
                    onClick={() => openInteraction("download")}
                    className="flex items-center gap-3 w-full text-left px-4 py-3 text-white text-base hover:bg-white/10 font-semibold transition-colors"
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Download Transcript
                  </button>
                </div>
              )}
            </div>

            {/* Auth button - dynamic based on login state */}
            {authState.loading ? (
              <div className="flex h-9 w-16 items-center justify-center rounded-full border-2 border-[#176A82] bg-white text-[13px] font-semibold text-gray-400">
                ...
              </div>
            ) : authState.authenticated ? (
              <Link href="/account">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#176A82] bg-white text-[13px] font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors"
                  aria-label="Account"
                  title="Account"
                >
                  {authState.userEmail 
                    ? authState.userEmail.slice(0, 2).toUpperCase() 
                    : "AC"
                  }
                </div>
              </Link>
            ) : (
              <Link href="/account">
                <button className="rounded-full bg-[#176A82] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 transition-opacity">
                  Sign In/Create Account
                </button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}