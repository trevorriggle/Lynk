"use client";

import { useState } from "react";
import LeftStack from "./components/LeftStack";
import RightPanel from "./components/RightPanel";
import Chat from "./components/Chat";
import DraggableModelButton from "./components/DraggableModelButton";

export default function Page() {
  // Model menu + picker (unchanged)
  const [model, setModel] = useState("Gemini 1.5 Pro");
  const [openModelMenuTick, setOpenModelMenuTick] = useState(0);

  // Inspector / context state
  const [active, setActive] = useState(false);
  const [activeContext, setActiveContext] = useState(null);

  // Called by LeftStack when a row is clicked
  const handleActivate = (ctx) => {
    setActive(true);
    setActiveContext(ctx);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Legacy <Header /> removed. TopBar is already rendered in layout.jsx */}

      {/* Main grid */}
     <div className="mx-auto w-full max-w-7xl flex-1 grid grid-cols-1 md:grid-cols-[16rem_minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)_20rem] items-start gap-x-6 gap-y-0 pt-0">
        {/* Left: collapsible nav */}
        <LeftStack onActivate={handleActivate} />

        {/* Center: chat area */}
        <main className="min-h-[60vh]">
          <Chat model={model} />
        </main>

        {/* Right: inspector */}
        <RightPanel active={active} activeContext={activeContext} />
      </div>

      {/* Floating model pill (draggable) */}
      <DraggableModelButton
        model={model}
        setModel={setModel}
        openFromHeader={openModelMenuTick}
      />
    </div>
  );
}

