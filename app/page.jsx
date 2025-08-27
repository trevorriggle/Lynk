"use client";

import { useState } from "react";
import LeftStack from "./components/LeftStack";
import RightPanel from "./components/RightPanel";
import Chat from "./components/Chat";
import DraggableModelButton from "./components/DraggableModelButton";

export default function Page() {
  const [model, setModel] = useState("Gemini 1.5 Pro");
  const [openModelMenuTick, setOpenModelMenuTick] = useState(0);

  const [active, setActive] = useState(false);
  const [activeContext, setActiveContext] = useState(null);

  const handleActivate = (ctx) => {
    setActive(true);
    setActiveContext(ctx);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Main content grid */}
      <div
        className="
          mx-auto w-full max-w-7xl flex-1
          grid grid-cols-1
          md:grid-cols-[16rem_minmax(0,1fr)]
          lg:grid-cols-[16rem_minmax(0,1fr)_20rem]
          items-start pt-0 gap-x-6 gap-y-0
          h-[calc(100vh-3rem)] min-h-0 overflow-hidden   /* 3rem matches pt-12 header */
        "
      >
        {/* Left rail */}
        <LeftStack onActivate={handleActivate} />

        {/* Center chat */}
        <main className="h-full min-h-0 overflow-hidden">
          <Chat model={model} />
        </main>

        {/* Right inspector */}
        <RightPanel active={active} activeContext={activeContext} />
      </div>

      {/* Floating model picker pill */}
      <DraggableModelButton
        model={model}
        setModel={setModel}
        openFromHeader={openModelMenuTick}
      />
    </div>
  );
}

