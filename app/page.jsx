"use client";

import { useState } from "react";
import Header from "./components/Header";
import LeftStack from "./components/LeftStack";
import RightPanel from "./components/RightPanel";
import Chat from "./components/Chat";
import DraggableModelButton from "./components/DraggableModelButton";

export default function Page() {
  // Model menu + picker (unchanged)
  const [model, setModel] = useState("Gemini 1.5 Pro");
  const [openModelMenuTick, setOpenModelMenuTick] = useState(0);

  // --- NEW: single source of truth for context/inspector state ---
  // When nothing has been selected, active=false (Inspector shows "Inactive")
  const [active, setActive] = useState(false);
  // Store what was selected from the left panel (command/project/file/etc.)
  // e.g. { type: "command", key: "carolina?" }
  const [activeContext, setActiveContext] = useState(null);

  // Called by LeftStack when a row is clicked
  const handleActivate = (ctx) => {
    // Optional: log to verify clicks are reaching here
    // console.log("activate:", ctx);
    setActive(true);
    setActiveContext(ctx);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        model={model}
        onOpenModelMenu={() => setOpenModelMenuTick((n) => n + 1)}
      />

      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 md:grid-cols-[16rem_minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)_20rem]">
        {/* Left: collapsible nav; onActivate wires into inspector */}
        <LeftStack onActivate={handleActivate} />

        {/* Center: chat area (you can later read active/activeContext to change the welcome state) */}
        <main className="min-h-[60vh]">
          <Chat model={model} />
        </main>

        {/* Right: inspector switches "Inactive" -> "Largely Active" */}
        <RightPanel active={active} activeContext={activeContext} />
      </div>

      <DraggableModelButton
        model={model}
        setModel={setModel}
        openFromHeader={openModelMenuTick}
      />
    </div>
  );
}
