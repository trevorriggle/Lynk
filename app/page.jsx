// app/page.jsx
"use client";

import { useState } from "react";
import LeftStack from "./components/LeftStack";
import RightPanel from "./components/RightPanel";
import Chat from "./components/Chat";
import DraggableModelButton from "./components/DraggableModelButton";

export default function Page() {
  // Model selector (floating pill) — start on Claude so your existing Claude route keeps working
  const [selectedModel, setSelectedModel] = useState({
    label: "Claude",
    provider: "anthropic",
    model: "claude-3-haiku-20240307",
    endpoint: "/api/session",
  });

  // Right-panel inspector state
  const [active, setActive] = useState(false);
  const [activeContext, setActiveContext] = useState(null);

  const handleActivate = (ctx) => {
    setActive(true);
    setActiveContext(ctx);
  };

  return (
    // Give the page wrapper exactly the viewport height minus header and prevent outer scrolling
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: "calc(100vh - var(--header-h))" }}
    >
      {/* Main content grid */}
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
        {/* Left rail */}
        <LeftStack onActivate={handleActivate} />

        {/* Center chat — fills its grid cell and controls its own scroll */}
        <main className="h-full min-h-0 overflow-hidden">
          {/* Pass the selected model object down */}
          <Chat selectedModel={selectedModel} />
        </main>

        {/* Right inspector */}
        <RightPanel active={active} activeContext={activeContext} />
      </div>

      {/* Floating model picker pill */}
      <DraggableModelButton
        model={selectedModel}
        setModel={setSelectedModel}
        // keep your prop if other code toggles it; pill ignores it if unused
        openFromHeader={0}
      />
    </div>
  );
}
