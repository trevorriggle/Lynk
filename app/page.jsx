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

  // Get session and model state from store
  const { activeId, order, createSession, selectedModel } = useSessionStore((s) => ({
    activeId: s.activeId,
    order: s.order,
    createSession: s.createSession,
    selectedModel: s.selectedModel,
  }));

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

  // Ensure at least one session on first load
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    if (!activeId && order.length === 0) {
      // Use the current selected model from store for initial session
      createSession(selectedModel);
    }
  }, [activeId, order, createSession, selectedModel]);

  return (
    <div className="h-full overflow-hidden" style={{ height: "calc(100vh - var(--header-h))" }}>
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

      <DraggableModelButton />
    </div>
  );
}