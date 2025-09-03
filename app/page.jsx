// app/page.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import LeftStack from "./components/LeftStack";
import RightPanel from "./components/RightPanel";
import Chat from "./components/Chat";
import DraggableModelButton from "./components/DraggableModelButton";
import { useSessionStore } from "./hooks/useSessionStore";

export default function Page() {
  const [selectedModel, setSelectedModel] = useState({
    label: "Claude",
    provider: "anthropic",
    model: "claude-3-haiku-20240307",
    endpoint: "/api/session",
  });

  const [active, setActive] = useState(false);
  const [activeContext, setActiveContext] = useState(null);

  const handleActivate = (ctx) => {
    setActive(true);
    setActiveContext(ctx);
  };

  // Ensure at least one session on first load
  const { activeId, order, createSession } = useSessionStore((s) => s);
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    if (!activeId && order.length === 0) {
      createSession({ label: "Claude", provider: "anthropic", model: "claude-3-haiku-20240307" });
    }
  }, [activeId, order, createSession]);

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
          <Chat selectedModel={selectedModel} />
        </main>
        <RightPanel active={active} activeContext={activeContext} />
      </div>

      <DraggableModelButton
        model={selectedModel}
        setModel={setSelectedModel}
        openFromHeader={0}
      />
    </div>
  );
}
