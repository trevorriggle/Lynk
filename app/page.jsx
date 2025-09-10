// app/page.jsx
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
    <div className="flex flex-col overflow-hidden" style={{ height: "calc(100vh - var(--header-h))" }}>
      <div
        className="
          mx-auto w-full max-w-7xl flex-1
          grid grid-cols-1
          md:grid-cols-[16rem_minmax(0,1fr)]
          lg:grid-cols-[16rem_minmax(0,1fr)_20rem]
          items-start pt-0 gap-x-6 gap-y-0
          h-full min-h-0 overflow-hidden
        "
      >
        <LeftStack onActivate={handleActivate} />
        
        <main className="h-full min-h-0 overflow-hidden">
          <Chat />
        </main>
        
        <RightPanel active={active} activeContext={activeContext} />
      </div>

      <DraggableModelButton />
    </div>
  );
}