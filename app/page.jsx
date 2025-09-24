"use client";

import { useEffect, useRef, useState } from "react";
import LeftStack from "./components/LeftStack";
import RightPanel from "./components/RightPanel";
import Chat from "./components/Chat";
import DraggableModelButton from "./components/DraggableModelButton";
import { useSessionStore } from "./hooks/useSessionStore";

export default function Page() {
  // UI state for panels - keep these as local state
  const [active, setActive] = useState(false);
  const [activeContext, setActiveContext] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [userFetched, setUserFetched] = useState(false);

  // Get session and model state from store
  const { activeId, order, sessions, createSession, selectSession, selectedModel, isLoading } = useSessionStore((s) => ({
    activeId: s.activeId,
    order: s.order,
    sessions: s.sessions,
    createSession: s.createSession,
    selectSession: s.selectSession,
    selectedModel: s.selectedModel,
    isLoading: s.isLoading,
  }));

  // Get current user info
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          setCurrentUserId(j?.userId || null);
        }
      } catch {}
      setUserFetched(true);
    };
    fetchUser();
  }, []);

  // Handle auth tokens from email verification
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash.includes('access_token')) {
      const params = new URLSearchParams(hash);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      
      if (access_token) {
        // Call finish endpoint to set cookies
        fetch('/api/auth/finish', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ access_token, refresh_token })
        }).then(() => {
          // Clear hash and reload to update auth state
          window.history.replaceState({}, document.title, '/');
          window.location.reload();
        }).catch(console.error);
      }
    }
  }, []);

  const handleActivate = (ctx) => {
    setActive(true);
    setActiveContext(ctx);
  };

  // Initialize session logic - wait for loading to complete AND user fetch, then handle session selection
  const booted = useRef(false);
  useEffect(() => {
    if (isLoading || !userFetched) return; // Wait for data to load AND user fetch to complete
    if (booted.current) return; // Only run once
    booted.current = true;

    const sessionKeys = Object.keys(sessions);

    if (sessionKeys.length === 0) {
      // No sessions exist, create the first one
      const newSessionId = createSession(selectedModel, currentUserId);
      console.log('Created initial session:', newSessionId, 'for user:', currentUserId);
    } else if (!activeId || !sessions[activeId]) {
      // Sessions exist but no active session, select the most recent
      const mostRecentId = order.length > 0 ? order[0] : sessionKeys[0];
      selectSession(mostRecentId);
      console.log('Selected existing session:', mostRecentId);
    }
    // If activeId exists and session exists, do nothing
  }, [isLoading, userFetched, activeId, order, sessions, createSession, selectSession, selectedModel, currentUserId]);

  return (
    <div className="relative" style={{ height: "calc(100vh - var(--header-h))" }}>
      {/* Fixed Three-Panel Flexbox Layout */}
      <div className="flex h-full overflow-hidden">
        {/* Left Panel - Fixed Width */}
        <div className="w-64 shrink-0 h-full overflow-hidden">
          <LeftStack onActivate={handleActivate} />
        </div>
        
        {/* Main Chat Area - Takes Remaining Space */}
        <div className="flex-1 min-w-0 h-full overflow-hidden">
          <Chat />
        </div>
        
        {/* Right Panel - Fixed Width, Hidden on Smaller Screens */}
        <div className="hidden lg:block">
          <RightPanel active={active} activeContext={activeContext} />
        </div>
      </div>

      {/* Draggable button positioned absolutely */}
      <DraggableModelButton />
    </div>
  );
}